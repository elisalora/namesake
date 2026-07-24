import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";
import { enrichName } from "@/lib/consultant";

// Fills in a name's meaning / origin / gender via Claude (no-op without a key).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const name = await db.nameEntry.findUnique({ where: { id } });
  if (!name) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getWritableMember(name.workspaceId);
  if (!access.ok) return writeDenied(access);

  if (name.meaning && name.origin) return NextResponse.json({ ok: true, skipped: true });

  const enriched = await enrichName(name.firstName);
  if (!enriched) return NextResponse.json({ ok: true, enriched: false });

  await db.nameEntry.update({
    where: { id },
    data: {
      meaning: name.meaning ?? enriched.meaning ?? null,
      origin: name.origin ?? enriched.origin ?? null,
      gender: name.gender ?? enriched.gender ?? null,
    },
  });
  return NextResponse.json({ ok: true, enriched: true });
}
