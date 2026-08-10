import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspaceState } from "@/lib/workspace";
import { getMemberForWorkspace, getWritableMember, writeDenied } from "@/lib/session";
import { MAX_BABIES } from "@/lib/babies";
import { DUE_DATE_MESSAGE, parseDueDate } from "@/lib/dates";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const member = await getMemberForWorkspace(id);
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const state = await getWorkspaceState(id);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ workspace: state, me: { id: member.id, name: member.name, color: member.color } });
}

// All of this was asked for once, at the start, when some of it wasn't known
// yet — a surname not yet settled, a nickname that hadn't stuck. An empty
// string clears a field rather than being ignored, so a wrong answer can be
// taken back and not merely replaced.
const patchSchema = z.object({
  babyLabel: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  babyCount: z.number().int().min(1).max(MAX_BABIES).optional(),
  dueDate: z.string().trim().optional(),
  expecting: z.enum(["girl", "boy", "mixed", "surprise"]).nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const access = await getWritableMember(id);
  if (!access.ok) return writeDenied(access);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check those details." }, { status: 400 });
  }
  const { babyLabel, lastName, babyCount, dueDate, expecting } = parsed.data;

  let due: Date | null | undefined;
  if (dueDate !== undefined) {
    if (dueDate === "") {
      due = null;
    } else {
      // The same rule the start form and gift redemption use — this route
      // used to check only that the string parsed, which let a date centuries
      // out be stored here even though it correctly refuses to move
      // `expiresAt`. One question, one answer, in lib/dates.ts.
      const d = parseDueDate(dueDate);
      if (!d) {
        return NextResponse.json({ error: DUE_DATE_MESSAGE }, { status: 400 });
      }
      due = d;
    }
  }

  // "One of each" stops meaning anything if they come back down to one baby,
  // so it's cleared with the count rather than left behind as nonsense — both
  // when it arrives in this request and when it was already stored.
  const current = await db.workspace.findUnique({ where: { id }, select: { expecting: true } });
  const wanted = expecting !== undefined ? expecting : (current?.expecting ?? null);
  const nextExpecting = wanted === "mixed" && babyCount === 1 ? null : wanted;

  await db.workspace.update({
    where: { id },
    data: {
      // A blank label would leave the journey nameless everywhere it appears.
      ...(babyLabel !== undefined ? { babyLabel: babyLabel || "Baby" } : {}),
      ...(lastName !== undefined ? { lastName: lastName || null } : {}),
      ...(babyCount !== undefined ? { babyCount } : {}),
      ...(due !== undefined ? { dueDate: due } : {}),
      ...(nextExpecting !== current?.expecting ? { expecting: nextExpecting } : {}),
    },
  });

  // A scan that found one fewer than they thought. Any baby that no longer
  // exists gives its name back to the shortlist rather than being stranded in
  // a slot nothing will ever show.
  if (babyCount !== undefined) {
    await db.nameEntry.updateMany({
      where: { workspaceId: id, chosenSlot: { gt: babyCount } },
      data: { status: "shortlist", chosenSlot: null, chosenReason: null },
    });
    // Only first names decide whether a baby has been named; a middle name is
    // optional and plenty of families never give one.
    const named = await db.nameEntry.count({
      where: { workspaceId: id, role: "first", chosenSlot: { not: null } },
    });
    await db.workspace.update({
      where: { id },
      data: { status: named >= babyCount ? "decided" : "active" },
    });
  }

  // Deliberately not touching expiresAt. The window was bought and paid for;
  // correcting a due date afterwards shouldn't quietly lengthen or shorten it.
  const state = await getWorkspaceState(id);
  return NextResponse.json({ ok: true, workspace: state });
}
