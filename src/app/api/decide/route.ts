import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";
import { MAX_BABIES } from "@/lib/babies";

const schema = z.object({
  workspaceId: z.string(),
  nameId: z.string(),
  /// Which baby this name is for. Absent means the first one still waiting,
  /// which is the only answer a single-baby journey can give.
  slot: z.number().int().min(1).max(MAX_BABIES).optional(),
  /// The middle name from the middle list, if they picked one. Explicit null
  /// means "no middle name" and clears whatever was there; absent means they
  /// weren't asked and nothing about the middle should change.
  middleId: z.string().nullable().optional(),
  reason: z.string().trim().max(1500).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { workspaceId, nameId, slot, middleId, reason } = parsed.data;

  const access = await getWritableMember(workspaceId);
  if (!access.ok) return writeDenied(access);

  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: { names: { where: { chosenSlot: { not: null } } } },
  });
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const name = await db.nameEntry.findFirst({
    where: { id: nameId, workspaceId, role: "first" },
  });
  if (!name) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Only first names claim a baby's slot; a middle rides along with one.
  const chosenFirsts = ws.names.filter((n) => n.role !== "middle");
  const chosenMiddles = ws.names.filter((n) => n.role === "middle");
  const taken = new Set(chosenFirsts.filter((n) => n.id !== nameId).map((n) => n.chosenSlot!));
  const target =
    slot ?? name.chosenSlot ?? Array.from({ length: ws.babyCount }, (_, i) => i + 1).find((s) => !taken.has(s));

  if (!target || target > ws.babyCount) {
    return NextResponse.json({ error: "Every baby already has a name." }, { status: 400 });
  }
  // One name per baby. Choosing again for a slot that's filled replaces what
  // was there rather than failing on the unique index — changing your mind is
  // allowed right up until the birth certificate.
  const displaced = chosenFirsts.find((n) => n.chosenSlot === target && n.id !== nameId);
  // The same, for the middle name: whatever was riding in this slot steps
  // aside for the one they just picked, or for none at all.
  const oldMiddle = chosenMiddles.find((n) => n.chosenSlot === target && n.id !== middleId);

  let middle = null;
  if (middleId) {
    middle = await db.nameEntry.findFirst({
      where: { id: middleId, workspaceId, role: "middle" },
    });
    if (!middle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const named = new Set([...taken, target]);
  const allNamed = named.size >= ws.babyCount;

  // The day they settled on it, stamped only when the name actually crosses
  // into this baby's slot. This endpoint is also how a middle name gets added
  // weeks later and how the story gets reworded, and neither of those is the
  // day they chose the name — re-stamping on every call is exactly the drift
  // that made the keepsake print a moving date in the first place.
  const now = new Date();
  const chosenAtFor = (entry: { chosenSlot: number | null }) =>
    entry.chosenSlot === target ? {} : { chosenAt: now };

  await db.$transaction([
    ...(displaced
      ? [
          db.nameEntry.update({
            where: { id: displaced.id },
            data: { status: "shortlist", chosenSlot: null, chosenReason: null, chosenAt: null },
          }),
        ]
      : []),
    ...(middleId !== undefined && oldMiddle
      ? [
          db.nameEntry.update({
            where: { id: oldMiddle.id },
            data: { status: "shortlist", chosenSlot: null, chosenAt: null },
          }),
        ]
      : []),
    ...(middleId && middle
      ? [
          db.nameEntry.update({
            where: { id: middleId },
            data: { status: "chosen", chosenSlot: target, ...chosenAtFor(middle) },
          }),
        ]
      : []),
    db.nameEntry.update({
      where: { id: nameId },
      data: {
        status: "chosen",
        chosenSlot: target,
        ...chosenAtFor(name),
        // Only touched when they were asked. Setting a middle name later
        // shouldn't quietly erase the story they wrote when they chose.
        ...(reason !== undefined ? { chosenReason: reason || null } : {}),
      },
    }),
    db.workspace.update({
      where: { id: workspaceId },
      // The journey is only over when every baby has a name. With twins, one
      // decision is a milestone, not an ending — the shortlist and the
      // consultant have to stay open for the second.
      data: { status: allNamed ? "decided" : "active" },
    }),
  ]);

  return NextResponse.json({ ok: true, slot: target, allNamed });
}

// Undo a decision. With one baby that reopens the journey; with twins it
// unpicks one name and leaves the other standing.
export async function DELETE(request: Request) {
  const parsed = z
    .object({ workspaceId: z.string(), nameId: z.string().optional() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { workspaceId, nameId } = parsed.data;

  const access = await getWritableMember(workspaceId);
  if (!access.ok) return writeDenied(access);

  const chosen = await db.nameEntry.findMany({
    where: { workspaceId, chosenSlot: { not: null } },
    orderBy: { chosenSlot: "asc" },
  });
  // No name named: undo the whole decision, which is what the old single-baby
  // "keep exploring" button means. Naming one puts that baby's middle name
  // back on the list with it — a middle name belongs to the name it was
  // chosen beside, and shouldn't outlive it.
  const slot = chosen.find((n) => n.id === nameId)?.chosenSlot;
  const undoing = nameId
    ? chosen.filter((n) => n.id === nameId || (n.role === "middle" && n.chosenSlot === slot))
    : chosen;

  await db.$transaction([
    ...undoing.map((n) =>
      db.nameEntry.update({
        where: { id: n.id },
        // chosenAt goes with the decision it dates. A name put back on the
        // shortlist and chosen again months later was chosen on the second day,
        // not the first.
        data: { status: "shortlist", chosenSlot: null, chosenReason: null, chosenAt: null },
      }),
    ),
    db.workspace.update({ where: { id: workspaceId }, data: { status: "active" } }),
  ]);

  return NextResponse.json({ ok: true });
}
