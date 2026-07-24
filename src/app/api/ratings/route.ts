import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";

const schema = z.object({
  nameId: z.string(),
  score: z.number().int().min(0).max(5).optional(),
  veto: z.boolean().optional(),
  vetoReason: z.string().trim().max(280).nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { nameId, score, veto, vetoReason } = parsed.data;

  const name = await db.nameEntry.findUnique({ where: { id: nameId } });
  if (!name) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getWritableMember(name.workspaceId);
  if (!access.ok) return writeDenied(access);
  const member = access.member;

  const rating = await db.rating.upsert({
    where: { nameId_memberId: { nameId, memberId: member.id } },
    create: {
      nameId,
      memberId: member.id,
      score: score ?? 0,
      veto: veto ?? false,
      vetoReason: vetoReason ?? null,
    },
    update: {
      ...(score !== undefined ? { score } : {}),
      ...(veto !== undefined ? { veto } : {}),
      ...(vetoReason !== undefined ? { vetoReason } : {}),
    },
  });

  return NextResponse.json({ ok: true, rating: { score: rating.score, veto: rating.veto } });
}
