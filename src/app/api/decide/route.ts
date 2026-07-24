import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";

const schema = z.object({
  workspaceId: z.string(),
  nameId: z.string(),
  reason: z.string().trim().max(1500).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { workspaceId, nameId, reason } = parsed.data;

  const access = await getWritableMember(workspaceId);
  if (!access.ok) return writeDenied(access);

  const name = await db.nameEntry.findFirst({ where: { id: nameId, workspaceId } });
  if (!name) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.$transaction([
    db.nameEntry.update({ where: { id: nameId }, data: { status: "chosen" } }),
    db.workspace.update({
      where: { id: workspaceId },
      data: { status: "decided", chosenNameId: nameId, decidedReason: reason || null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

// Undo the decision (reopen the journey).
export async function DELETE(request: Request) {
  const parsed = z.object({ workspaceId: z.string() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { workspaceId } = parsed.data;

  const access = await getWritableMember(workspaceId);
  if (!access.ok) return writeDenied(access);

  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.chosenNameId) {
    await db.nameEntry.update({ where: { id: ws.chosenNameId }, data: { status: "shortlist" } });
  }
  await db.workspace.update({
    where: { id: workspaceId },
    data: { status: "active", chosenNameId: null },
  });
  return NextResponse.json({ ok: true });
}
