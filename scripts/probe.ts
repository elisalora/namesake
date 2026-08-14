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
import { FREE_TURNS } from "../src/lib/trial";
import { TIERS } from "../src/lib/pricing";
import { analyzeName, checkHeadline } from "../src/lib/nameChecks";
import { PinCard } from "../src/lib/og";
import { cleanNamePart, NAME_MAX } from "../src/lib/nameInput";
import { cleanCheckInput, runCheck } from "../src/lib/checkPage";
import { readFileSync } from "node:fs";

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
  // Distinctness, not a count. This asserted `length === 4` and went red the
  // moment a fifth step was added — an instrument reporting a fact about
  // itself rather than about the thing it measures.
  check("every event name is distinct", new Set(names).size === names.length, names.join(", "));
  check(
    "and none of them is empty or whitespace",
    names.every((n) => typeof n === "string" && n.trim() === n && n.length > 0),
  );
}

/* -------------------------------------------- what a name card actually says */

/// These are cheap and pure, and they exist because the defect they cover was
/// invisible to every reading of this file: three branches fired to announce
/// that nothing was wrong, and one of them was the headline on 94% of cards.
/// Counting is what found it, so counting is what guards it.
function probeNameChecks() {
  section("Name checks (finding 13)");

  const say = (first: string, last: string, middle = "") =>
    analyzeName({ firstName: first, middleName: middle, lastName: last });
  const titles = (first: string, last: string, middle = "") =>
    say(first, last, middle).map((c) => c.title);

  // --- No check may exist whose job is to report an absence.
  const REASSURANCE = ["nothing awkward there", "nothing collides, nothing chimes", "Nothing awkward in the pair"];
  const source = readFileSync(new URL("../src/lib/nameChecks.ts", import.meta.url), "utf8");
  for (const phrase of REASSURANCE) {
    check(`no check says "${phrase}"`, !source.includes(phrase));
  }

  // The three surfaces those branches used to fire on, asserted through the
  // function rather than the source — a phrase can be reworded, a branch
  // returning has to be caught by what it returns.
  check(
    "an unremarkable monogram produces no line at all",
    !titles("Emma", "Ellis", "Rose").some((t) => t.startsWith("Monogram:")),
    titles("Emma", "Ellis", "Rose").join(" | "),
  );
  check(
    "a full name that collides with nothing produces no line about the full name",
    !titles("Emma", "Ellis", "Rose").some((t) => t.includes("reads well")),
  );
  check(
    "a sibling pair that sits fine together produces no line",
    !analyzeName({ firstName: "Emma", middleName: "", lastName: "Ellis" }, [
      { label: "their brother", firstName: "Thomas", middleName: "", lastName: "Ellis" },
    ]).some((c) => c.title.startsWith("Said together:")),
  );

  // --- But the real findings all survive. This is the half that would break
  // if someone "cleaned up" the deletion by taking the branch above it too.
  check("an unfortunate monogram is still called out", titles("Adam", "Sutton", "Sam").some((t) => t.includes('spell "ASS"')));
  check("a delightful monogram is still called out", titles("Jonah", "Yardley", "Opal").some((t) => t.includes('spell "Joy"')));
  check("a rhyme is still called out", titles("Bella", "Ella").some((t) => t.includes("rhyme")));
  check("a run-on is still called out", titles("Thomas", "Smith").some((t) => t.includes("Two matching sounds")));
  check("a long full name is still called out", titles("Alexandria", "Fotopoulos", "Josephine").some((t) => t.includes("A long full name")));
  check(
    "a missing surname still asks for one",
    titles("Emma", "").some((t) => t.includes("Add your surname")),
  );

  // --- Alliteration compares sounds, not letters.
  check("hard C alliterates with hard C", titles("Carter", "Cole").includes("Nice alliteration"));
  check("soft C does not alliterate with hard C", !titles("Cynthia", "Carter").includes("Nice alliteration"));
  check("soft G does not alliterate with hard G", !titles("George", "Garcia").includes("Nice alliteration"));
  check("hard G still alliterates with hard G", titles("Grace", "Garcia").includes("Nice alliteration"));
  // The fix is not only subtractive — it finds alliteration the letters missed.
  check("soft C alliterates with S", titles("Cynthia", "Sinclair").includes("Nice alliteration"));
  check("soft G alliterates with J", titles("Georgia", "Jackson").includes("Nice alliteration"));

  // --- The two names with nothing between them.
  const fuse = (f: string, l: string) => titles(f, l).includes("Nothing between the names");
  check("a final schwa against a vowel surname is called out", fuse("Emma", "Osei"));
  check("and -ah counts, which is the case the old letter test missed", fuse("Hannah", "Osei"));
  check("...on every one of them", ["Sarah", "Noah", "Micah", "Isaiah", "Delilah"].every((f) => fuse(f, "Ellis")));
  check("a high front ending takes a /j/ glide and does not fuse", !fuse("Emily", "Ellis"));
  check("a rounded ending takes a /w/ glide and does not fuse", !fuse("Theo", "Ellis"));
  check("a silent e is not a vowel sound at all", !fuse("Grace", "Ellis"));
  // The bug that made this worth reopening: y- is a consonant.
  check("a Y- surname is a consonant and never fuses", !fuse("Emma", "Yamamoto") && !fuse("Mia", "Young"));
  check("nor does a plain consonant surname", !fuse("Emma", "Smith"));
  // The illustration is only generated where it comes out right.
  check(
    "a plain -a name is shown the fused word",
    say("Emma", "Osei").some((c) => c.detail.includes("*Emmosei*")),
  );
  check(
    "an -ah name is not shown an invented one",
    say("Hannah", "Osei").every((c) => !c.detail.includes("*")),
  );

  // --- The initials list, after Marzipan's audit.
  check(
    "CS is no longer a warning — it was every Charlotte and Caleb Smith's whole result",
    titles("Charlotte", "Smith").length === 0,
    titles("Charlotte", "Smith").join(" | "),
  );
  check("but BS still is, and it is true", titles("Brianna", "Smith").some((t) => t.includes('"BS"')));
  check(
    "ASH is a name, not a warning",
    say("Amara", "Hughes", "Sofia").some((c) => c.level === "delight" && c.title.includes('"Ash"')),
    titles("Amara", "Hughes", "Sofia").join(" | "),
  );
  // Two letters are read, not spelled. With no middle name two letters is the
  // ordinary monogram, so this is the wording most people get.
  check("two initials are read", titles("Brianna", "Smith").some((t) => t.startsWith("The initials read ")));
  check(
    "three initials are spelled",
    titles("Adam", "Sutton", "Sam").some((t) => t.startsWith("The initials spell ")),
  );

  // --- A sibling we know, and a sibling we don't.
  const sameName = (label: string | null) =>
    analyzeName({ firstName: "Emma", middleName: "", lastName: "Ellis" }, [
      { label, firstName: "Emma", middleName: "", lastName: "Ellis" },
    ]).map((c) => c.title);
  check("a workspace names the other baby", sameName("their brother").includes("That's their brother's name"));
  check(
    "a page with two boxes and no relationship does not invent one",
    sameName(null).includes("That's the same name in both boxes"),
    sameName(null).join(" | "),
  );

  // --- One headline rule, not two.
  check("the headline prefers a watch over everything", checkHeadline(say("Bella", "Ella"))?.level === "watch");
  check(
    "the headline prefers a delight over an info",
    checkHeadline([
      { level: "info", title: "i", detail: "" },
      { level: "delight", title: "d", detail: "" },
    ])?.title === "d",
  );
  // The interaction that made the fallback worth arguing about: with the
  // reassurances gone, falling through to checks[0] shows a true info line
  // rather than dropping the tier off the card entirely.
  check("and falls through to a real info finding rather than nothing", checkHeadline(say("Thomas", "Smith"))?.title === "Two matching sounds meet in the middle");
  check("but still returns null when there is genuinely nothing to say", checkHeadline([]) === null);
  // The divergence that put "nothing awkward there" on screen in the first
  // place: NameCard had its own copy of this rule with a different fallback.
  const card = readFileSync(new URL("../src/components/NameCard.tsx", import.meta.url), "utf8");
  check(
    "NameCard uses checkHeadline instead of reimplementing it",
    card.includes("checkHeadline(name.checks)") && !card.includes('c.level === "watch"'),
  );
}


/* ------------------------------------------------- what the share card says */

/// Every string the card would draw, in the order it draws them.
///
/// Walked out of the element tree rather than grepped out of the source,
/// because the thing being guarded is a *rendered* sentence: a grep can't tell
/// a card from the comment above it, and the comment above it is about a
/// sentence we deliberately no longer draw. `PinCard` is called rather than
/// written as `<PinCard/>`, which would be an element nobody has rendered yet.
function cardText(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(cardText);
  const el = node as { props?: { children?: unknown } };
  return el.props ? cardText(el.props.children) : [];
}

/// The reassurance came back once already.
///
/// `analyzeName` was cleared of three branches whose job was to report an
/// absence, and then the card grew a fourth — "Nothing to flag." set large, in
/// a different file, on the surface with the widest reach in the product. It
/// passed every check above, because every check above is about `nameChecks`.
///
/// So this asserts the rule where it kept failing, one level up: the card that
/// found nothing draws the name and nothing else.
function probePinCard() {
  section("The share card, when there is nothing to say");

  const FOOT = "namesake.alora.tech/check";
  const empty = cardText(
    PinCard({ name: "Michael James Whitfield", initials: "MJW", findings: [], foot: FOOT }),
  );

  check(
    "a card with no findings draws the name, the monogram and the footer — and nothing else",
    empty.join(" | ") === `Michael James Whitfield | MJW | ${FOOT}`,
    empty.join(" | "),
  );
  check(
    "so it says nothing about having found nothing",
    !empty.some((s) => /nothing/i.test(s)),
    empty.join(" | "),
  );

  // The other half, which would break if someone "fixed" the above by taking
  // the findings with it.
  const full = cardText(
    PinCard({
      name: "Hannah Rose Osei",
      initials: "HRO",
      findings: ["Nothing between the names"],
      foot: FOOT,
    }),
  );
  check(
    "a card with a finding still draws it",
    full.includes("Nothing between the names"),
    full.join(" | "),
  );

  // A real finding is allowed to contain the word — `analyzeName` owns its own
  // copy and the check above must not become a ban on it. This is the seam:
  // the rule is about the *slot*, not the vocabulary.
  check(
    "and a finding that happens to say 'nothing' is not mistaken for the empty state",
    full.length === 4,
    String(full.length),
  );

  // Never a silent truncation — five findings must say so rather than show four.
  const many = cardText(
    PinCard({ name: "Alexandria Josephine Fotopoulos", initials: "AJF", findings: ["a", "b", "c", "d", "e"], foot: FOOT }),
  );
  // Joined, not per-string: `and {hidden} more on the page` is three text
  // nodes, and asserting against one of them tests JSX rather than the card.
  check("five findings are not quietly shown as four", many.join("").includes("and 1 more on the page"), many.join(""));
}

/* ------------------------------------------------------ the free check page */

/// Pure, so it runs everywhere. The HTTP half is in `probeCheckSurfaces`.
function probeCheckPageLogic() {
  section("The free /check page");

  // --- What may be treated as a name.
  check("a name survives intact", cleanNamePart("Siobhán O'Brien-Ng") === "Siobhán O'Brien-Ng");
  check("markup does not", !cleanNamePart("<script>x</script>Emma").includes("<"));
  check("nor do digits or emoji", cleanNamePart("Emma2 🎉") === "Emma");
  check("nor a newline", cleanNamePart("Emma\nRose") === "Emma Rose");
  check("a bidi override is gone", !cleanNamePart("Emma‮Rose").includes("‮"));
  check("length is bounded", cleanNamePart("E".repeat(500)).length === NAME_MAX);
  check("punctuation alone is not a name", cleanNamePart(" -. ") === "");
  check("and neither is nothing", cleanNamePart(null) === "");

  // --- The page and the card ask the same question of the same input.
  const cleaned = cleanCheckInput({ first: " eleanor ", middle: "Rose", last: "Whitfield!", sibling: "" });
  check("the input is cleaned once, in one place", cleaned.first === "eleanor" && cleaned.last === "Whitfield");

  const eleanor = runCheck(cleanCheckInput({ first: "Eleanor", middle: "Rose", last: "Whitfield" }));
  check("the full name is what would be written out", eleanor.fullName === "Eleanor Rose Whitfield");
  check("the monogram is the initials", eleanor.initials === "ERW");
  // Not the empty state, and this is worth pinning: the copy deck uses
  // "Eleanor Rose Whitfield" to illustrate *nothing found*, but Eleanor ends
  // on R and Rose begins on one, so the middle-name join fires. Three names in
  // four are empty; this particular three are not.
  check(
    "the deck's own example is a findings card, not an empty one",
    eleanor.findings.some((c) => c.title === "The middle name runs into its neighbour"),
    eleanor.findings.map((c) => c.title).join(" | "),
  );
  const quiet = runCheck(cleanCheckInput({ first: "Charlotte", middle: "", last: "Smith" }));
  check("and the empty state — what most people get — really is empty", quiet.findings.length === 0,
    quiet.findings.map((c) => c.title).join(" | "));

  // --- The surname prompt is an instruction, not a finding.
  const partial = runCheck(cleanCheckInput({ first: "Eleanor", middle: "", last: "", sibling: "" }));
  check("with no surname the page is in its partial state", partial.needsSurname);
  check(
    "and the 'add your surname' line is not counted as a finding",
    partial.findings.every((c) => !c.title.startsWith("Add your surname")),
    partial.findings.map((c) => c.title).join(" | "),
  );
  check("a single initial is not a monogram", partial.initials === "");

  // --- A real finding still reaches the page.
  const fused = runCheck(cleanCheckInput({ first: "Hannah", middle: "", last: "Osei", sibling: "" }));
  check("a schwa meeting a vowel is a finding", fused.findings.some((c) => c.title === "Nothing between the names"));

  // --- The sibling field, which is the differentiated half.
  const pair = runCheck(cleanCheckInput({ first: "Arthur", middle: "", last: "Whitfield", sibling: "Arthur" }));
  check(
    "two identical names read as a slip, not as a decision nobody made",
    pair.findings.some((c) => c.title === "That's the same name in both boxes"),
    pair.findings.map((c) => c.title).join(" | "),
  );

  // --- The handoff carries a name onto the shortlist.
  const seeded = journeyDraft.parse({
    you: { name: "Alex", email: "probe-seed@example.com" },
    partner: {},
    lastName: "Whitfield",
    seedName: { firstName: "Eleanor", middleName: "Rose" },
  });
  check("the draft carries a seed name", seeded.seedName?.firstName === "Eleanor");
  // A hand-crafted URL must never be able to refuse somebody a signup: the
  // seed is a nicety, so a malformed one is dropped rather than rejected.
  const junk = journeyDraft.parse({
    you: { name: "Alex", email: "probe-seed2@example.com" },
    partner: {},
    seedName: { firstName: "" },
  });
  check("a malformed seed is dropped, not fatal", junk.seedName === undefined);
  // And every draft written before this field existed still parses.
  check(
    "an old draft with no seed still parses",
    journeyDraft.parse({ you: { name: "Alex", email: "probe-seed3@example.com" }, partner: {} }).seedName ===
      undefined,
  );
}

/// The seeded name actually lands on the shortlist. Needs a database.
async function probeSeededShortlist() {
  section("The /check handoff, end to end");

  const user = await db.user.create({
    data: { email: `probe-seed-${Date.now()}@example.com`, name: "Alex" },
  });
  const draft = journeyDraft.parse({
    you: { name: "Alex", email: `probe-seed-${Date.now()}@example.com` },
    partner: {},
    lastName: "Whitfield",
    seedName: { firstName: "Eleanor", middleName: "Rose" },
  });
  const { workspace } = await createJourney(draft, user.id, { isTrial: true });

  const names = await db.nameEntry.findMany({ where: { workspaceId: workspace.id } });
  check("the journey opens with exactly one name on it", names.length === 1, String(names.length));
  check("it is the name they checked", names[0]?.firstName === "Eleanor" && names[0]?.middleName === "Rose");
  check("shortlisted, not merely under consideration", names[0]?.status === "shortlist");
  // Null, so it follows the family surname if they ever change it — the
  // per-name override means "this one name against a different surname",
  // which is not what happened here.
  check("and it inherits the workspace surname rather than pinning one", names[0]?.lastName === null);
  check("the surname came across too", workspace.lastName === "Whitfield");

  const plainUser = await db.user.create({
    data: { email: `probe-plain-${Date.now()}@example.com`, name: "Alex" },
  });
  const plain = await createJourney(
    journeyDraft.parse({ you: { name: "Alex", email: `probe-plain-${Date.now()}@example.com` }, partner: {} }),
    plainUser.id,
    { isTrial: true },
  );
  check(
    "a journey started without the handoff is still empty",
    (await db.nameEntry.count({ where: { workspaceId: plain.workspace.id } })) === 0,
  );
}

/// robots.txt, sitemap.xml, the page and the card, as served.
async function probeCheckSurfaces() {
  section("Tier 0 — what a crawler and a visitor actually get");

  const origin = process.env.PROBE_ORIGIN;
  if (!origin) {
    console.log("  skip  no PROBE_ORIGIN set — these are HTTP surfaces");
    return;
  }

  const robots = await fetch(`${origin}/robots.txt`);
  const robotsText = await robots.text();
  check("robots.txt is served at all — it was a 404", robots.status === 200, String(robots.status));
  check("it points at the sitemap", robotsText.includes("/sitemap.xml"));
  // The private rooms. Unguessable is not unlisted.
  for (const path of ["/w/", "/s/", "/join/", "/redeem/", "/auth/", "/api/", "/admin"]) {
    check(`it keeps crawlers out of ${path}`, robotsText.includes(`Disallow: ${path}`), robotsText);
  }
  // And the one that must NOT be disallowed, asserted as loudly as the ones
  // that must. A `noindex` is only obeyed on a URL a crawler is allowed to
  // fetch; disallowing this one would leave Google free to index
  // `/check/card?first=…&last=…` as a bare URL — the child's name — with no way
  // left to tell it not to. The header below is what does the work.
  check(
    "and it does NOT disallow /check/card, because that is what lets the noindex be read",
    !robotsText.includes("Disallow: /check/card"),
    robotsText,
  );
  check(
    "which only holds because the card says noindex itself",
    (await fetch(`${origin}/check/card?first=Ada&last=Whitfield`)).headers
      .get("x-robots-tag")
      ?.includes("noindex") === true,
  );

  const sitemap = await fetch(`${origin}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  check("sitemap.xml is served — it was a 404 too", sitemap.status === 200, String(sitemap.status));
  check("the free page is in it", sitemapText.includes("/check<"));
  // The failure this guards is the quiet one: unset, the origin falls back to
  // localhost and the sitemap builds, validates, and is fiction. Skipped when
  // the probe is itself pointed at localhost, where it is the truth.
  if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    check("and no localhost URL was published as fact", !sitemapText.includes("localhost"), sitemapText.slice(0, 200));
  }
  for (const secret of ["/w/", "/join/", "/redeem/", "/journeys"]) {
    check(`no private path leaked into it: ${secret}`, !sitemapText.includes(secret));
  }

  const page = await fetch(`${origin}/check`);
  const html = await page.text();
  check("/check is served", page.status === 200, String(page.status));
  check("the privacy line is on it", html.includes("save what you type here"));
  check(
    "and it is reachable from the storefront",
    (await fetch(origin).then((r) => r.text())).includes('href="/check"'),
  );

  const card = await fetch(`${origin}/check/card?first=Eleanor&middle=Rose&last=Whitfield`);
  check("the share card renders", card.status === 200, String(card.status));
  check(
    "as a PNG",
    card.headers.get("content-type")?.includes("image/png") === true,
    String(card.headers.get("content-type")),
  );
  // Two layers, because they fail differently: robots stops the fetch, the
  // header stops the keep.
  check(
    "and it is noindex, so an indexed one can't become a page of ours about a stranger's child",
    card.headers.get("x-robots-tag")?.includes("noindex") === true,
    String(card.headers.get("x-robots-tag")),
  );
  const bare = await fetch(`${origin}/check/card`);
  check("a card with no name is refused rather than drawn", bare.status === 400, String(bare.status));
  const junkCard = await fetch(`${origin}/check/card?first=${encodeURIComponent("123 🎉")}`);
  check("and so is one whose name is not a name", junkCard.status === 400, String(junkCard.status));
}

/* ----------------------------------------------------------- the free tier */

/// Whether this run is pointed at a server whose model key is deliberately
/// broken. One flag, read in three places, so a run can't be half-configured.
function brokenModelRun() {
  return process.env.PROBE_BROKEN_MODEL === "1";
}

/// A browser. Keeps a cookie jar, because everything below turns on *which
/// person* is asking — the whole point of a per-person allowance is that two
/// signed-in people in one journey are in different states.
function browser(origin: string) {
  const jar = new Map<string, string>();
  return {
    jar,
    async req(path: string, init: RequestInit = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(`${origin}${path}`, {
        ...init,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(init.headers ?? {}),
        },
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [k, ...rest] = c.split(";")[0].split("=");
        jar.set(k, rest.join("="));
      }
      const text = await res.text();
      // Loose on purpose. Half of what this talks to answers with plain text
      // or HTML, and a shape declared here would be a second, drifting copy
      // of every route's return type.
      let json: Record<string, string> = {};
      try {
        json = JSON.parse(text) as Record<string, string>;
      } catch {
        /* html or plain text */
      }
      return { status: res.status, json, text };
    },
  };
}

/// Sign somebody in the way the product does — request a link, open it.
async function signIn(b: ReturnType<typeof browser>, email: string) {
  const asked = await b.req("/api/auth/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!asked.json?.devUrl) throw new Error(`no dev link for ${email}: ${asked.text.slice(0, 200)}`);
  await b.req(new URL(asked.json.devUrl).pathname);
}

async function probeFreeTier() {
  section("The free tier");

  const origin = process.env.PROBE_ORIGIN;
  if (!origin) {
    console.log("  skip  no PROBE_ORIGIN set — this whole section needs a running server");
    return;
  }
  // Everything below needs a consultant that answers. Against the
  // deliberately-broken server that `probeFailedTurnIsRefunded` wants, every
  // turn is correctly refunded and nothing can ever be spent — so these
  // checks would go red for the opposite of the reason they look like.
  if (brokenModelRun()) {
    console.log("  skip  PROBE_BROKEN_MODEL is set — spending turns needs a consultant that replies");
    return;
  }

  const stamp = Date.now();
  const ownerEmail = `trial-owner-${stamp}@example.com`;
  const partnerEmail = `trial-partner-${stamp}@example.com`;
  const owner = browser(origin);

  // --- starting one, and where the workspace is born -----------------------

  const started = await owner.req("/api/start", {
    method: "POST",
    body: JSON.stringify({
      draft: {
        you: { name: "Alex", email: ownerEmail },
        partner: { name: "Sam", email: partnerEmail },
        babyLabel: "Probe",
      },
    }),
  });
  check("a free journey can be started without paying", started.status === 200, started.text.slice(0, 120));

  const code = started.json.url.split("/").pop();
  const grant = await db.purchase.findUnique({ where: { redeemCode: code } });
  check("it mints a grant worth nothing, already paid", grant?.amountCents === 0 && grant?.status === "paid");
  check(
    "and no workspace exists yet — the journey is born past the magic link",
    (await db.workspace.count({ where: { purchases: { some: { id: grant!.id } } } })) === 0,
  );

  await signIn(owner, ownerEmail);
  const claimed = await owner.req("/api/redeem", { method: "POST", body: JSON.stringify({ code }) });
  check("a verified owner can claim it", claimed.status === 200, claimed.text.slice(0, 160));

  const workspaceId: string = claimed.json.workspaceId;
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  check("the journey it makes is marked as a trial", ws?.isTrial === true);
  check("and it has a real window, not an unlimited one", ws?.expiresAt !== null);

  // --- spending turns ------------------------------------------------------

  const say = (b: ReturnType<typeof browser>, text: string) =>
    b.req("/api/chat", { method: "POST", body: JSON.stringify({ workspaceId, message: text }) });

  const ownerUser = await db.user.findUnique({ where: { email: ownerEmail } });
  check("the owner starts with none spent", ownerUser?.freeTurnsUsed === 0);

  for (let i = 0; i < FREE_TURNS; i += 1) {
    const said = await say(owner, `probe turn ${i}`);
    if (said.status !== 200) {
      check(`turn ${i + 1} of ${FREE_TURNS} is allowed`, false, `${said.status} ${said.text.slice(0, 80)}`);
      return;
    }
  }
  check(`all ${FREE_TURNS} free turns are allowed`, true);
  check(
    "and exactly that many were counted — not one more, not one fewer",
    (await db.user.findUnique({ where: { email: ownerEmail } }))?.freeTurnsUsed === FREE_TURNS,
    String((await db.user.findUnique({ where: { email: ownerEmail } }))?.freeTurnsUsed),
  );

  // `wall_reached` is the denominator for "is $20 the right price", so it has
  // to fire exactly once per person. Off Vercel it prints rather than sends,
  // which is the only way to see it from here — but the thing that makes it
  // exactly-once is the RETURNING on the spend, and that is checked below by
  // the count landing on the allowance and never past it.
  const wall = await say(owner, "one more");
  check(
    "the next one is refused with its own code, not the expired-journey one",
    wall.status === 402 && wall.text === "free_trial_used",
    `${wall.status} ${wall.text.slice(0, 60)}`,
  );
  check(
    "and the refusal wrote nothing — a turn nobody got is not in the transcript",
    (await db.chatMessage.count({ where: { workspaceId, content: "one more" } })) === 0,
  );

  // --- the partner has their own ten --------------------------------------

  const seat = await db.member.findFirst({ where: { workspaceId, isOwner: false } });
  const partner = browser(origin);
  await partner.req("/api/auth/request", {
    method: "POST",
    body: JSON.stringify({ email: partnerEmail, seatToken: seat!.token, name: "Sam" }),
  });
  const partnerLink = await db.loginToken.findFirst({
    where: { email: partnerEmail },
    orderBy: { createdAt: "desc" },
  });
  check("the partner was issued a seat link", Boolean(partnerLink));
  // The raw token only ever existed in the response, so claim the seat the
  // way the invite email does: ask again and follow the URL we're handed.
  const partnerAsk = await partner.req("/api/auth/request", {
    method: "POST",
    body: JSON.stringify({ email: partnerEmail, seatToken: seat!.token, name: "Sam" }),
  });
  await partner.req(new URL(partnerAsk.json.devUrl).pathname);

  const partnerSaid = await say(partner, "partner's first question");
  check(
    "the partner arrives with their own allowance, not the remains of the owner's",
    partnerSaid.status === 200,
    `${partnerSaid.status} ${partnerSaid.text.slice(0, 80)}`,
  );
  check(
    "spending theirs doesn't touch the owner's count",
    (await db.user.findUnique({ where: { email: ownerEmail } }))?.freeTurnsUsed === FREE_TURNS &&
      (await db.user.findUnique({ where: { email: partnerEmail } }))?.freeTurnsUsed === 1,
  );

  // --- what the two of them see -------------------------------------------

  const seen = (await getWorkspaceState(workspaceId))!;
  const ownerSeat = seen.members.find((m) => m.isOwner)!;
  const partnerSeat = seen.members.find((m) => !m.isOwner)!;
  check("the journey reports itself as a trial", seen.isTrial === true);
  check("the owner's seat shows nought left", ownerSeat.freeTurnsLeft === 0);
  check(
    "and the partner's shows theirs — two people, one screen, different states",
    partnerSeat.freeTurnsLeft === FREE_TURNS - 1,
    String(partnerSeat.freeTurnsLeft),
  );

  // --- the two closed doors ------------------------------------------------

  // The refund promise has to sit under the button that charges. It used to
  // live under the start form; the free tier took that button's money away,
  // and for a while it reappeared nowhere — leaving a gifter promised thirty
  // days and the self-serve buyer, the whole person this tier exists to
  // convert, promised nothing.
  const walled = await owner.req(`/w/${workspaceId}`);
  const flat = walled.text.replace(/<!--.*?-->/g, "").replace(/&apos;|&#x27;/g, "'");
  check("the wall is on screen", flat.includes("still yours to read"));
  check(
    "and the button that charges carries the refund promise",
    flat.includes("refundable") && flat.includes('href="/refunds"'),
  );
  // The landing page keeps its footer link to /refunds — that is navigation,
  // and it was never the thing at issue. What must not come back is a refund
  // *term* in the fine print under a button that takes no money.
  const landing = await fetch(origin).then((r) => r.text());
  check(
    "while the free start button, taking no money, promises no refund window",
    !landing.includes("refundable") && !landing.includes("thirty days"),
  );

  const shower = await owner.req(`/w/${workspaceId}/shower`);
  check(
    "the shower card is closed on a trial",
    shower.text.includes("comes with the full journey"),
    `${shower.status}`,
  );
  // Deliberately a bare fetch with no cookie. `/w/[id]/keepsake` has no
  // session check by design — a keepsake you can't send to a grandparent
  // isn't a keepsake — so the gate has to be on the journey, and this is a
  // stranger holding the link, which is the only reader that proves it.
  const keepsake = await fetch(`${origin}/w/${workspaceId}/keepsake`).then((r) => r.text());
  check(
    "and so is the keepsake, to a stranger holding the link and no session",
    keepsake.includes("comes with the full journey"),
  );

  // The *page*, not the id. Ten lines below this the journey gets bought, and
  // a paid journey has no wall on it — reading it later would check a screen
  // that no longer exists and quietly find nothing.
  walledWallHtml = walled.text;

  // --- buying it -----------------------------------------------------------

  const upgrade = await owner.req("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ kind: "upgrade", workspaceId }),
  });
  check("the wall's button reaches a checkout", upgrade.status === 200, upgrade.text.slice(0, 120));

  const upgradePurchase = await db.purchase.findFirst({
    where: { workspaceId, kind: "extend", tier: "self_serve" },
    orderBy: { createdAt: "desc" },
  });
  check("which is a purchase against this journey, not a second one", Boolean(upgradePurchase));
  check(
    "priced the same as buying it outright",
    upgradePurchase?.amountCents === TIERS.self_serve.amountCents,
    String(upgradePurchase?.amountCents),
  );

  const paid = await owner.req("/api/dev/fulfill", {
    method: "POST",
    body: JSON.stringify({ purchaseId: upgradePurchase!.id }),
  });
  check("and paying it goes through", paid.status === 200, paid.text.slice(0, 120));

  const afterPay = await db.workspace.findUnique({ where: { id: workspaceId } });
  check("the journey stops being a trial", afterPay?.isTrial === false);
  check(
    "one person paying opens it for both — which is what the wall promises out loud",
    (await getWorkspaceState(workspaceId))!.members.every((m) => m.freeTurnsLeft === null),
  );

  const afterWall = await say(owner, "and now?");
  check("the owner, who had nought left, can talk again", afterWall.status === 200, String(afterWall.status));
  check(
    "and it cost them nothing — free turns are only spent where nobody has paid",
    (await db.user.findUnique({ where: { email: ownerEmail } }))?.freeTurnsUsed === FREE_TURNS,
    String((await db.user.findUnique({ where: { email: ownerEmail } }))?.freeTurnsUsed),
  );

  // Hold on to a walled session before we buy the journey out of that state,
  // so the refund check below can read the wall as the person standing at it.
  const showerAfter = await owner.req(`/w/${workspaceId}/shower`);
  check("the shower card opens", !showerAfter.text.includes("comes with the full journey"));
  const keepsakeAfter = await fetch(`${origin}/w/${workspaceId}/keepsake`).then((r) => r.text());
  check(
    "and the keepsake stops being gated for everyone, session or not",
    !keepsakeAfter.includes("comes with the full journey"),
  );

  const upgradeTwice = await owner.req("/api/checkout", {
    method: "POST",
    body: JSON.stringify({ kind: "upgrade", workspaceId }),
  });
  check(
    "and it can't be bought a second time — a stale tab must not charge twice",
    upgradeTwice.status === 409,
    String(upgradeTwice.status),
  );
}

/// Every surface that names a refund term names the same one.
///
/// Marzipan's, and it is the same rule as the due-date sentence one level up:
/// a term restated in prose in several places goes wrong the moment one of
/// them is edited, and it goes wrong confidently, in front of a customer.
/// **This is not hypothetical.** Five live surfaces promised fourteen days
/// against a thirty-day policy for twelve days, and it was caught only
/// because somebody went looking.
///
/// Deliberately reads the *rendered pages* rather than grepping the source.
/// What matters is what a customer is told, and a string that never reaches a
/// screen is not a promise.
///
/// **Expect this to be red until PR #7 lands.** `/refunds`, the FAQ and
/// `GiftForm` still say fourteen on this branch; `RefundNote`, written to the
/// policy Elisabeth approved, says thirty. That disagreement is real and the
/// point of this check is to refuse it rather than to let three people
/// remember a merge order.
async function probeRefundTermAgrees() {
  section("The refund term, said the same way everywhere");

  const origin = process.env.PROBE_ORIGIN;
  if (!origin) {
    console.log("  skip  needs a running server");
    return;
  }

  // Every way of writing a length of time that has appeared in this copy.
  //
  // Matched case-insensitively, and that is not fussiness. The first version
  // of this check was case-sensitive and silently skipped the FAQ entirely,
  // because its answer opens the sentence — "Fourteen days from purchase".
  // A cross-surface check that quietly covers one fewer surface than it
  // claims to is worse than no check, and it is the third time tonight an
  // instrument of mine has produced a finding about itself.
  const TERMS = ["fourteen", "thirty", "14 days", "30 days"];
  const termIn = (html: string) => {
    const flat = html
      .replace(/<!--.*?-->/g, "")
      .replace(/&apos;|&#x27;/g, "'")
      .toLowerCase();
    return TERMS.filter((t) => flat.includes(t));
  };

  const surfaces: { where: string; html: string }[] = [
    { where: "/refunds", html: await fetch(`${origin}/refunds`).then((r) => r.text()) },
    { where: "/faq", html: await fetch(`${origin}/faq`).then((r) => r.text()) },
    { where: "/gift (GiftForm)", html: await fetch(`${origin}/gift`).then((r) => r.text()) },
  ];
  if (walledWallHtml) {
    // The wall is the newest surface and the only one behind a session, so it
    // is also the one most likely to drift unnoticed.
    surfaces.push({ where: "the wall (RefundNote)", html: walledWallHtml });
  } else {
    console.log("  note  the wall was not reached this run, so it is not covered here");
  }

  const found = surfaces
    .map((s) => ({ ...s, terms: termIn(s.html) }))
    .filter((s) => s.terms.length > 0);

  for (const s of found) console.log(`         ${s.where}: ${s.terms.join(", ")}`);

  const distinct = new Set(found.flatMap((s) => s.terms));
  check(
    "every surface that names a refund term names the same one",
    distinct.size === 1,
    distinct.size === 0
      ? "no surface states a term at all — the promise has gone missing again"
      : `${[...distinct].join(" vs ")} — merge #7 before #10`,
  );
  check(
    "and at least one of them says it",
    found.length > 0,
    "nothing on any surface names a refund window",
  );
}

/// The wall as it was rendered to the person standing at it, kept because the
/// journey is bought a few lines later and the wall stops existing.
let walledWallHtml: string | null = null;

/// Two tabs, one last turn. Read-then-write would let both through.
async function probeLastTurnRace() {
  section("The last free turn, twice at once");

  const origin = process.env.PROBE_ORIGIN;
  if (!origin) {
    console.log("  skip  needs a running server");
    return;
  }
  if (brokenModelRun()) {
    console.log("  skip  PROBE_BROKEN_MODEL is set — see the note in probeFreeTier");
    return;
  }

  const stamp = Date.now();
  const email = `race-${stamp}@example.com`;
  const b = browser(origin);
  const started = await b.req("/api/start", {
    method: "POST",
    body: JSON.stringify({ draft: { you: { name: "Race", email }, partner: {} } }),
  });
  await signIn(b, email);
  const claimed = await b.req("/api/redeem", {
    method: "POST",
    body: JSON.stringify({ code: started.json.url.split("/").pop() }),
  });
  const workspaceId: string = claimed.json.workspaceId;

  // Straight to one remaining, rather than nine round trips to get there.
  await db.user.update({ where: { email }, data: { freeTurnsUsed: FREE_TURNS - 1 } });

  // The turn lock means only one of these reaches the consultant anyway — so
  // what this checks is the thing underneath it: that the loser's turn was
  // handed back rather than quietly kept.
  const both = await Promise.all([
    b.req("/api/chat", { method: "POST", body: JSON.stringify({ workspaceId, message: "a" }) }),
    b.req("/api/chat", { method: "POST", body: JSON.stringify({ workspaceId, message: "b" }) }),
  ]);
  const allowed = both.filter((r) => r.status === 200).length;
  check("at most one of two simultaneous last turns is answered", allowed <= 1, String(allowed));
  check(
    "and the count lands on exactly the allowance — never past it",
    (await db.user.findUnique({ where: { email } }))?.freeTurnsUsed === FREE_TURNS,
    String((await db.user.findUnique({ where: { email } }))?.freeTurnsUsed),
  );

  const after = await b.req("/api/chat", {
    method: "POST",
    body: JSON.stringify({ workspaceId, message: "c" }),
  });
  check("and the next one is walled", after.status === 402 && after.text === "free_trial_used");
}

/// A free turn given back when the consultant never said a word.
///
/// Its own section because it needs a differently-broken server — one started
/// with a key the model will refuse:
///
///   DATABASE_URL=… ANTHROPIC_API_KEY=sk-ant-deliberately-invalid npx next dev -p 3113
///   DATABASE_URL=… PROBE_ORIGIN=http://127.0.0.1:3113 PROBE_BROKEN_MODEL=1 npm run probe
///
/// Worth the awkwardness. Charging somebody one of ten for our own outage is
/// the kind of small unfairness nobody reports and everybody remembers, and
/// the branch that prevents it cannot be reached with a working key.
async function probeFailedTurnIsRefunded() {
  const origin = process.env.PROBE_ORIGIN;
  if (!origin || process.env.PROBE_BROKEN_MODEL !== "1") return;

  section("A consultant that says nothing costs nothing");

  const email = `refund-${Date.now()}@example.com`;
  const b = browser(origin);
  const started = await b.req("/api/start", {
    method: "POST",
    body: JSON.stringify({ draft: { you: { name: "Ref", email }, partner: {} } }),
  });
  await signIn(b, email);
  const claimed = await b.req("/api/redeem", {
    method: "POST",
    body: JSON.stringify({ code: started.json.url.split("/").pop() }),
  });

  const said = await b.req("/api/chat", {
    method: "POST",
    body: JSON.stringify({ workspaceId: claimed.json.workspaceId, message: "hello" }),
  });
  check(
    "the outage is apologised for rather than thrown",
    said.status === 200 && said.text.includes("couldn't reach my thoughts"),
    said.text.slice(0, 80),
  );
  check(
    "and the turn was handed back",
    (await db.user.findUnique({ where: { email } }))?.freeTurnsUsed === 0,
    String((await db.user.findUnique({ where: { email } }))?.freeTurnsUsed),
  );
}

/* ---------------------------------------------------------------------- run */

async function main() {
  probeDueDate();
  probeFunnelNames();
  probeNameChecks();
  probePinCard();
  probeCheckPageLogic();
  await probeIndexes();
  await probeSeededShortlist();
  await probeCheckSurfaces();
  const workspaceId = await probeWorkspaceState();
  await probeSuggestLimits(workspaceId);
  await probeFreeTier();
  await probeLastTurnRace();
  await probeFailedTurnIsRefunded();
  await probeRefundTermAgrees();

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
