import { db } from "@/lib/db";
import { analyzeName, type Sibling } from "@/lib/nameChecks";
import { hasExpired } from "@/lib/session";
import { slotLabel } from "@/lib/babies";
import { turnHolder } from "@/lib/turn";

export async function getWorkspaceState(workspaceId: string) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      names: {
        orderBy: { createdAt: "desc" },
        include: {
          ratings: { include: { member: true } },
          comments: { orderBy: { createdAt: "asc" }, include: { member: true } },
        },
      },
      // Bounded, like everything else on this query. This is the payload of a
      // poll that runs every six seconds in two browsers, and the endpoint
      // that fills this list is the one public write path in the product —
      // anyone who photographs a shower card can add to it. `POST
      // /api/suggest/[slug]` now refuses past 500 per journey, so 200 here is
      // a display bound rather than the thing holding the door: it is the
      // newest 200, and a journey that ever reaches it is drowning in
      // suggestions rather than losing any.
      suggestions: { orderBy: { createdAt: "desc" }, take: 200 },
      // The *newest* 200, not the oldest.
      //
      // This was `orderBy: asc` with the same `take`, which is the same
      // mistake `api/chat/route.ts` documents fixing in its own copy of this
      // query — and it was still here. Past 200 messages the dashboard froze
      // on the opening small-talk: every new reply landed in the database,
      // the panel kept rendering the first 200, and the consultant looked
      // like it had stopped answering. `NAMESAKE_MSG_CAP` allows 120 user
      // turns, so a couple who really uses this reaches 240 messages and
      // meets it.
      messages: { orderBy: { createdAt: "desc" }, take: 200, include: { member: true } },
    },
  });
  if (!ws) return null;

  // Back into the order they were said in — the query above fetched them
  // newest first to get the right end of a long conversation.
  const messages = [...ws.messages].reverse();

  const firsts = ws.names.filter((n) => n.role !== "middle");
  const middles = ws.names.filter((n) => n.role === "middle");

  // The middle name a baby actually ends up with: the one chosen from the
  // middle list, or — for the couple who simply typed "Willow Alice" and never
  // opened that list — the one sitting inline on the first name. One rule, in
  // one place, so nothing downstream has to decide this for itself.
  const chosenMiddleBySlot = new Map(
    middles.filter((n) => n.chosenSlot !== null).map((n) => [n.chosenSlot!, n]),
  );
  const middleFor = (n: (typeof firsts)[number]) =>
    (n.chosenSlot !== null ? chosenMiddleBySlot.get(n.chosenSlot)?.firstName : null) ??
    n.middleName;

  // The babies who already have a name. Every remaining candidate is measured
  // against them, because from here on a name is half of a pair.
  const decided = firsts
    .filter((n) => n.chosenSlot !== null)
    .sort((a, b) => (a.chosenSlot ?? 0) - (b.chosenSlot ?? 0));

  // A middle name is only ever heard between two others, so a candidate is
  // shown against a real first name: the one already chosen, or whichever is
  // furthest ahead on hearts. Alone it has nothing to be judged on.
  const hearts = (n: (typeof firsts)[number] & { ratings: { score: number }[] }) =>
    n.ratings.reduce((t, r) => t + r.score, 0);
  const reference =
    decided[0] ??
    [...firsts]
      .filter((n) => !n.ratings.some((r) => r.veto))
      .sort((a, b) => hearts(b) - hearts(a))[0];

  const names = ws.names.map((n) => {
    const isMiddle = n.role === "middle";
    const surname = n.lastName ?? ws.lastName;
    const siblings: Sibling[] = isMiddle
      ? // Twins sharing a middle name is a tradition, not a clash — and the
        // pair checks belong on the first names, where they'd be said aloud.
        []
      : decided
          .filter((d) => d.id !== n.id)
          .map((d) => ({
            label: slotLabel(d.chosenSlot!),
            firstName: d.firstName,
            middleName: middleFor(d),
            lastName: d.lastName ?? ws.lastName,
          }));
    const checks = isMiddle
      ? reference
        ? analyzeName({
            firstName: reference.firstName,
            middleName: n.firstName,
            lastName: reference.lastName ?? ws.lastName,
          })
        : []
      : analyzeName(
          { firstName: n.firstName, middleName: middleFor(n), lastName: surname },
          siblings,
        );
    return {
      id: n.id,
      role: isMiddle ? "middle" : "first",
      firstName: n.firstName,
      middleName: isMiddle ? null : middleFor(n),
      /// For a middle name: the whole name it would make, against the first
      /// name it's being weighed beside. Null when there's nothing to try it
      /// against yet.
      pairedWith:
        isMiddle && reference
          ? [reference.firstName, n.firstName, reference.lastName ?? ws.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
      lastName: surname,
      gender: n.gender,
      origin: n.origin,
      meaning: n.meaning,
      status: n.status,
      source: n.source,
      chosenSlot: n.chosenSlot,
      chosenReason: n.chosenReason,
      createdAt: n.createdAt.toISOString(),
      checks,
      ratings: n.ratings.map((r) => ({
        memberId: r.memberId,
        member: r.member.name,
        score: r.score,
        veto: r.veto,
        vetoReason: r.vetoReason,
      })),
      comments: n.comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        memberId: c.memberId,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  });

  return {
    id: ws.id,
    babyLabel: ws.babyLabel,
    lastName: ws.lastName,
    babyCount: ws.babyCount,
    expecting: ws.expecting,
    status: ws.status,
    suggestSlug: ws.suggestSlug,
    dueDate: ws.dueDate ? ws.dueDate.toISOString() : null,
    expiresAt: ws.expiresAt ? ws.expiresAt.toISOString() : null,
    expired: hasExpired(ws),
    // Computed here rather than in the client so rendering stays a pure
    // function of its props — the poll keeps it fresh.
    daysLeft: ws.expiresAt
      ? Math.ceil((ws.expiresAt.getTime() - Date.now()) / 86_400_000)
      : null,
    // One entry per baby who has a name, in slot order. For a single baby
    // this is the old `chosenName` and `decidedReason` in a list of one.
    chosen: decided.map((n) => ({
      slot: n.chosenSlot!,
      label: slotLabel(n.chosenSlot!),
      nameId: n.id,
      firstName: n.firstName,
      middleName: middleFor(n),
      /// The middle-list entry behind that middle name, when it came from
      /// there rather than being typed inline — so it can be unpicked.
      middleId: chosenMiddleBySlot.get(n.chosenSlot!)?.id ?? null,
      fullName: [n.firstName, middleFor(n), n.lastName ?? ws.lastName].filter(Boolean).join(" "),
      reason: n.chosenReason,
    })),
    createdAt: ws.createdAt.toISOString(),
    members: ws.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      isOwner: m.isOwner,
      joined: Boolean(m.userId),
    })),
    // The seat still waiting on someone. Only ever reaches a signed-in member
    // of this journey, so it's safe to carry the claim token.
    pendingSeat: (() => {
      const seat = ws.members.find((m) => !m.userId);
      return seat ? { name: seat.name, email: seat.email, token: seat.token } : null;
    })(),
    names,
    suggestions: ws.suggestions.map((s) => ({
      id: s.id,
      suggestedName: s.suggestedName,
      suggesterName: s.suggesterName,
      relationship: s.relationship,
      reason: s.reason,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      authorName: m.member?.name ?? null,
      authorColor: m.member?.color ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    // Whoever is mid-question with the consultant right now, so the other
    // screen can show it rather than letting them ask into the same breath.
    // Staleness is settled here rather than on the client: a lock left behind
    // by a server that died should never be painted as a person still typing.
    turn: (() => {
      const holder = turnHolder(ws);
      if (!holder) return null;
      const m = ws.members.find((x) => x.id === holder);
      return { memberId: holder, name: m?.name ?? "Someone" };
    })(),
  };
}

export type WorkspaceState = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
export type NameState = WorkspaceState["names"][number];
