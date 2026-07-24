import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";

const schema = z.object({ status: z.enum(["pending", "dismissed"]) });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const suggestion = await db.suggestion.findUnique({ where: { id } });
  if (!suggestion) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = await getWritableMember(suggestion.workspaceId);
  if (!access.ok) return writeDenied(access);

  await db.suggestion.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
