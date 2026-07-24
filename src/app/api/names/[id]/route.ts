import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMemberForWorkspace } from "@/lib/session";

const patchSchema = z.object({
  status: z.enum(["considering", "shortlist", "vetoed", "chosen"]).optional(),
  middleName: z.string().trim().max(60).nullable().optional(),
  meaning: z.string().trim().max(280).nullable().optional(),
  origin: z.string().trim().max(120).nullable().optional(),
});

async function authorize(nameId: string) {
  const name = await db.nameEntry.findUnique({ where: { id: nameId } });
  if (!name) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const member = await getMemberForWorkspace(name.workspaceId);
  if (!member) return { error: NextResponse.json({ error: "not_a_member" }, { status: 403 }) };
  return { name, member };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await db.nameEntry.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  await db.nameEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
