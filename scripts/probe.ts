// A probe, not a test suite.
//
// This repository has never had one, which is how a 500 on the gift-redemption
// path and a nine-century paid window both survived six pull requests: every
// claim about this code has been made by reading it. What follows runs it.
//
// Deliberately one file with no framework. It needs a Postgres and nothing
// else, it prints one line per check, and it exits non-zero on the first
// failure — so it is as useful in a terminal as in CI, and there is no runner
// to learn before you can add a line to it.
//
//   DATABASE_URL=postgres://…/namesake_probe npm run probe
//
// Point it at a scratch database. It writes rows and does not clean up after
// itself, on purpose: a failing probe is much easier to understand when the
// rows it left behind are still there to look at.

import "dotenv/config";

import {
  parseDueDate,
  isDueDateOrBlank,
  DUE_DATE_MAX_MONTHS_AHEAD,
  DUE_DATE_MAX_MONTHS_BEHIND,
  DUE_DATE_MESSAGE,
} from "../src/lib/dates";
import { journeyDraft, createJourney } from "../src/lib/journey";
import { resolveExpiry } from "../src/lib/purchase";
import { getWorkspaceState } from "../src/lib/workspace";
import { db } from "../src/lib/db";
import { FUNNEL } from "../src/lib/funnel";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------- the due date, in isolation */

function probeDueDate() {
  section("Due dates (finding 1 + 2)");

  const now = new Date("2026-08-10T00:00:00.000Z");

  check("a plain date is accepted", parseDueDate("2026-12-01", now) !== null);
  check("blank is not a date, and not an error", parseDueDate("", now) === null && isDueDateOrBlank("", now));
  check("undefined is allowed by the schema helper", isDueDateOrBlank(undefined, now));

  // Finding 2: this is the one that 500s.
  check('"banana" is refused', parseDueDate("banana", now) === null);
  check('"banana" fails the schema rather than reaching a Date', !isDueDateOrBlank("banana", now));

  // Finding 1: this is the one that buys nine centuries for $50.
  check('"2999-01-01" is refused', parseDueDate("2999-01-01", now) === null);
  // The JS maximum — a *valid* Date, which is why the old `Number.isNaN`
  // guard let it through and `+7 days` then overflowed.
  check('"+275760-09-12" is refused', parseDueDate("+275760-09-12", now) === null);

  // The bounds themselves, one day either side.
  const justInside = new Date(now);
  justInside.setMonth(justInside.getMonth() + DUE_DATE_MAX_MONTHS_AHEAD);
  justInside.setDate(justInside.getDate() - 1);
  check("a date just inside the forward bound is accepted", parseDueDate(justInside.toISOString(), now) !== null);
  const justOutside = new Date(now);
  justOutside.setMonth(justOutside.getMonth() + DUE_DATE_MAX_MONTHS_AHEAD);
  justOutside.setDate(justOutside.getDate() + 2);
  check("a date just outside it is refused", parseDueDate(justOutside.toISOString(), now) === null);

  // A birth eighteen months ago is a real thing people enter here.
  check("a date well in the past is accepted", parseDueDate("2025-06-01", now) !== null);

  // The refusal quotes both bounds, so it has to be built from them rather
  // than restating them — a sentence that quotes a number is wrong the moment
  // somebody changes the number, and wrong confidently, in front of a
  // customer. This is the check that notices.
  check(
    "the refusal names the forward bound it actually enforces",
    DUE_DATE_MESSAGE.includes(DUE_DATE_MAX_MONTHS_AHEAD === 12 ? "a year ahead" : `${DUE_DATE_MAX_MONTHS_AHEAD} months ahead`),
    DUE_DATE_MESSAGE,
  );
  check(
    "and the backward one",
    DUE_DATE_MESSAGE.includes(DUE_DATE_MAX_MONTHS_BEHIND === 24 ? "two years ago" : `${DUE_DATE_MAX_MONTHS_BEHIND} months ago`),
    DUE_DATE_MESSAGE,
  );

  section("The draft schema is what actually stops it");
  const base = { you: { name: "Alex", email: "alex@example.com" }, partner: {} };
  check(
    "journeyDraft rejects a nonsense due date",
    !journeyDraft.safeParse({ ...base, dueDate: "banana" }).success,
  );
  check(
    "journeyDraft rejects a due date centuries out",
    !journeyDraft.safeParse({ ...base, dueDate: "2999-01-01" }).success,
  );
  check(
    "journeyDraft accepts a real one",
    journeyDraft.safeParse({ ...base, dueDate: "2026-12-01" }).success,
  );
  check("journeyDraft accepts no due date at all", journeyDraft.safeParse(base).success);

  section("resolveExpiry can no longer return an invalid window");
  const gift = { expiryRule: "due_date_grace", months: null, graceDays: 7, fallbackMonths: 9 };
  const from = new Date("2026-08-10T00:00:00.000Z");

  const real = resolveExpiry(gift, from, parseDueDate("2026-12-01", from));
  check("a real due date sets the window to it plus the grace", real.toISOString().startsWith("2026-12-08"));

  const refused = resolveExpiry(gift, from, parseDueDate("2999-01-01", from));
  const nineMonths = resolveExpiry(gift, from, null);
  check(
    "a refused due date falls back to nine months rather than nine centuries",
    refused.getTime() === nineMonths.getTime(),
    refused.toISOString(),
  );

  // Belt and braces: hand it the overflowing date directly, bypassing the
  // parser, the way a row written before this change could.
  const overflow = resolveExpiry(gift, from, new Date(8.64e15));
  check(
    "an overflowing date is caught by the result check, not left as Invalid Date",
    !Number.isNaN(overflow.getTime()),
    String(overflow),
  );
}

/* ------------------------------------------------------------- against the db */

async function probeWorkspaceState() {
  section("The polled read (finding 3 + 4)");

  const draft = journeyDraft.parse({
    babyLabel: "Probe",
    you: { name: "Alex", email: `probe-${Date.now()}@example.com` },
    partner: { name: "Sam" },
  });
  const user = await db.user.create({
    data: { email: `probe-owner-${Date.now()}@example.com`, name: "Alex" },
  });
  const { workspace } = await createJourney(draft, user.id, {
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  // 205 messages, so the 200 bound is crossed and the ordering matters.
  const total = 205;
  for (let i = 0; i < total; i += 1) {
    await db.chatMessage.create({
      data: {
        workspaceId: workspace.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i}`,
        // Explicit, increasing, and distinct — `now()` for 205 rows in a loop
        // can tie, and a tie is exactly what would make an ordering check
        // pass by luck.
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
      },
    });
  }

  const state = (await getWorkspaceState(workspace.id))!;
  check("the transcript is bounded at 200", state.messages.length === 200, String(state.messages.length));
  check(
    "it is the NEWEST 200, not the oldest",
    state.messages[state.messages.length - 1].content === `message ${total - 1}`,
    state.messages[state.messages.length - 1].content,
  );
  check(
    "and they are still in the order they were said",
    state.messages[0].content === `message ${total - 200}`,
    state.messages[0].content,
  );

  // 210 suggestions, likewise.
  for (let i = 0; i < 210; i += 1) {
    await db.suggestion.create({
      data: {
        workspaceId: workspace.id,
        suggestedName: `Name${i}`,
        suggesterName: `Guest${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
      },
    });
  }
  const state2 = (await getWorkspaceState(workspace.id))!;
  check("the suggestion list is bounded at 200", state2.suggestions.length === 200, String(state2.suggestions.length));
  check(
    "and it keeps the newest, which is what the couple hasn't read",
    state2.suggestions[0].suggestedName === "Name209",
    state2.suggestions[0].suggestedName,
  );

  return workspace.id;
}

async function probeIndexes() {
  section("Indexes exist on the polled columns (finding 4)");
  const want = [
    "Suggestion_workspaceId_createdAt_idx",
    "ChatMessage_workspaceId_createdAt_idx",
    "Comment_nameId_idx",
    "Comment_workspaceId_idx",
    "Member_userId_idx",
  ];
  const rows = await db.$queryRawUnsafe<{ indexname: string }[]>(
    `select indexname from pg_indexes where schemaname = current_schema()`,
  );
  const have = new Set(rows.map((r) => r.indexname));
  for (const name of want) check(name, have.has(name));
}

async function probeSuggestLimits(workspaceId: string) {
  section("The public suggestion endpoint refuses a flood (finding 3)");

  // The route is reachable only over HTTP, and driving it any other way would
  // test a copy of it rather than it. So: a real journey, a real slug, and a
  // real fetch at whatever `PROBE_ORIGIN` points at.
  const origin = process.env.PROBE_ORIGIN;
  if (!origin) {
    console.log("  skip  no PROBE_ORIGIN set — start `npm run dev` and re-run to cover this");
    return;
  }

  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { suggestSlug: true } });
  const url = `${origin}/api/suggest/${ws!.suggestSlug}`;
  const post = (body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // This journey already holds 210 suggestions from the probe above, so the
  // burst window is the limit it meets first.
  const first = await post({ suggesterName: "Fresh Guest", suggestedName: "Wholly New" });
  check("a first suggestion is accepted", first.status === 200, String(first.status));

  const again = await post({ suggesterName: "fresh guest", suggestedName: "WHOLLY NEW" });
  const againBody = await again.json();
  check(
    "the same name from the same person again is a no-op, not an error",
    again.status === 200 && againBody.duplicate === true,
    `${again.status} ${JSON.stringify(againBody)}`,
  );

  let sawBurst = false;
  for (let i = 0; i < 15 && !sawBurst; i += 1) {
    const res = await post({ suggesterName: `Guest B${i}`, suggestedName: `Burst${i}` });
    if (res.status === 429) sawBurst = true;
  }
  check("a burst is refused with 429, not 409", sawBurst);

  // Now the other limit. Fill the journey past 500 directly rather than over
  // HTTP — the burst rule would take an hour to get there one minute at a
  // time, and what's being checked is the total cap, not the way rows arrive.
  const already = await db.suggestion.count({ where: { workspaceId } });
  const filler = Array.from({ length: Math.max(0, 500 - already) }, (_, i) => ({
    workspaceId,
    suggestedName: `Filler${i}`,
    suggesterName: `Filler Guest ${i}`,
    createdAt: new Date(Date.UTC(2025, 0, 1) + i * 60_000),
  }));
  if (filler.length) await db.suggestion.createMany({ data: filler });

  const full = await post({ suggesterName: "Latecomer", suggestedName: "Too Late" });
  check(
    "past 500 the journey is full, and says so permanently (409)",
    full.status === 409 && (await full.json()).error === "full",
    String(full.status),
  );

  // The bound on the read has to hold on the same journey that just hit the
  // bound on the write — otherwise the dashboard is where the flood lands.
  const state = (await getWorkspaceState(workspaceId))!;
  check(
    "and the dashboard still only loads 200 of them",
    state.suggestions.length === 200,
    String(state.suggestions.length),
  );
}

function probeFunnelNames() {
  section("Funnel event names");
  const names = Object.values(FUNNEL);
  check("all four are distinct", new Set(names).size === names.length && names.length === 4);
  check(
    "and none of them is empty or whitespace",
    names.every((n) => typeof n === "string" && n.trim() === n && n.length > 0),
  );
}

/* ---------------------------------------------------------------------- run */

async function main() {
  probeDueDate();
  probeFunnelNames();
  await probeIndexes();
  const workspaceId = await probeWorkspaceState();
  await probeSuggestLimits(workspaceId);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await db.$disconnect();
});
