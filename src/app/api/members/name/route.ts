import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMemberForWorkspace } from "@/lib/session";

const schema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

/// Set your own display name in a journey.
///
/// Deliberately only your own seat: your partner named you when they set this
/// up, and being able to rename them from across the table isn't a feature
/// anybody asked for. Allowed while expired too — correcting your own name
/// isn't the kind of writing a closed window is meant to stop.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "What should we call you?" }, { status: 400 });
  }

  const member = await getMemberForWorkspace(parsed.data.workspaceId);
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  await db.member.update({ where: { id: member.id }, data: { name: parsed.data.name } });

  // Give the account a name too if it never got one.
  const user = await db.user.findFirst({ where: { id: member.userId ?? "" } });
  if (user && !user.name) {
    await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  }

  return NextResponse.json({ ok: true, name: parsed.data.name });
}
