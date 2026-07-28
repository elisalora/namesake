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
