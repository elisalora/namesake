import { NextResponse } from "next/server";
import { getWorkspaceState } from "@/lib/workspace";
import { getMemberForWorkspace } from "@/lib/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const member = await getMemberForWorkspace(id);
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const state = await getWorkspaceState(id);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ workspace: state, me: { id: member.id, name: member.name, color: member.color } });
}
