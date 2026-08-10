import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasExpired } from "@/lib/session";

const schema = z.object({
  suggestedName: z.string().trim().min(1).max(60),
  suggesterName: z.string().trim().min(1).max(60),
  relationship: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(600).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

/// Nobody signs in to reach this, so the limits are the only thing standing
/// between a photographed shower card and a dashboard that won't load.
///
/// All three are per *workspace* rather than per IP on purpose. A serverless
/// deployment has no shared memory to count IPs in, and the alternative —
/// another table, written to on every request — costs more than the thing it
/// protects. Per-workspace is the blast radius that actually matters: whatever
/// one guest does, they can only spoil the one journey whose link they hold.
const MAX_PER_WORKSPACE = 500;
const BURST_WINDOW_MS = 60_000;
const MAX_PER_BURST_WINDOW = 10;

// Public endpoint — family & friends submit via the shareable link. No auth.
//
// The error codes are narrower than they look like they need to be, and that's
// deliberate: this is the one screen in the product used by someone with no
// account, no context, and no way to ask what went wrong. Collapsing "they've
// already chosen" and "the window closed" into one `closed` left the form with
// nothing true to say, so it said "try again in a moment" — to a person for
// whom trying again would never work.
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Which field, so the form can point at it. `reason` is the only one long
    // enough to overflow by accident — and the only one anyone would grieve
    // losing, since it's the story rather than the name.
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json(
      { error: "invalid", field: typeof field === "string" ? field : null },
      { status: 400 },
    );
  }

  const ws = await db.workspace.findUnique({ where: { suggestSlug: slug } });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // `archived` isn't assigned anywhere in the app today, but the schema allows
  // it — so don't tell someone a name was chosen on the strength of "not
  // active".
  if (ws.status === "decided") {
    return NextResponse.json({ error: "decided" }, { status: 409 });
  }
  if (ws.status !== "active") {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }
  // Family and friends can't post into a journey whose window has closed
  // either — the public link is a write path like any other.
  if (hasExpired(ws)) {
    return NextResponse.json({ error: "expired" }, { status: 409 });
  }

  const [total, recent, duplicate] = await Promise.all([
    db.suggestion.count({ where: { workspaceId: ws.id } }),
    db.suggestion.count({
      where: { workspaceId: ws.id, createdAt: { gt: new Date(Date.now() - BURST_WINDOW_MS) } },
    }),
    // Case-insensitively the same name from the same person. Grandma pressing
    // send twice is by far the likeliest cause, and she should be thanked
    // rather than told off — so this isn't an error, it's a no-op that looks
    // exactly like success. It also happens to blunt the cheapest kind of
    // flood, which is the same row over and over.
    db.suggestion.findFirst({
      where: {
        workspaceId: ws.id,
        suggestedName: { equals: parsed.data.suggestedName, mode: "insensitive" },
        suggesterName: { equals: parsed.data.suggesterName, mode: "insensitive" },
      },
      select: { id: true },
    }),
  ]);

  if (duplicate) return NextResponse.json({ ok: true, duplicate: true });

  // Permanent, so a 409 — the form disables its button on one of these, which
  // is right here: nothing about waiting will make room.
  if (total >= MAX_PER_WORKSPACE) {
    return NextResponse.json({ error: "full" }, { status: 409 });
  }
  // Temporary, so a 429 and *not* a 409. Told it was full, a real guest at a
  // busy shower would give up on a link that would have worked a minute later.
  if (recent >= MAX_PER_BURST_WINDOW) {
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  }

  await db.suggestion.create({
    data: {
      workspaceId: ws.id,
      suggestedName: parsed.data.suggestedName,
      suggesterName: parsed.data.suggesterName,
      relationship: parsed.data.relationship || null,
      reason: parsed.data.reason || null,
      email: parsed.data.email || null,
    },
  });

  return NextResponse.json({ ok: true });
}
