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
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ws = await db.workspace.findUnique({ where: { suggestSlug: slug } });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.status !== "active") {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }
  // Family and friends can't post into a journey whose window has closed
  // either — the public link is a write path like any other.
  if (hasExpired(ws)) {
    return NextResponse.json({ error: "closed" }, { status: 409 });
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
