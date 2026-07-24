import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";

const schema = z.object({
  nameId: z.string(),
  body: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { nameId, body } = parsed.data;

  const name = await db.nameEntry.findUnique({ where: { id: nameId } });
  if (!name) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getWritableMember(name.workspaceId);
  if (!access.ok) return writeDenied(access);
  const member = access.member;

  const comment = await db.comment.create({
    data: {
      workspaceId: name.workspaceId,
      nameId,
      memberId: member.id,
      authorName: member.name,
      body,
    },
  });

  return NextResponse.json({ id: comment.id });
}
