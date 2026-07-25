import { db } from "@/lib/db";
import { analyzeName } from "@/lib/nameChecks";
import { hasExpired } from "@/lib/session";

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
      suggestions: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" }, take: 200, include: { member: true } },
      chosenName: true,
    },
  });
  if (!ws) return null;

  const names = ws.names.map((n) => {
    const checks = analyzeName({
      firstName: n.firstName,
      middleName: n.middleName,
      lastName: n.lastName ?? ws.lastName,
    });
    return {
      id: n.id,
      firstName: n.firstName,
      middleName: n.middleName,
      lastName: n.lastName ?? ws.lastName,
      gender: n.gender,
      origin: n.origin,
      meaning: n.meaning,
      status: n.status,
      source: n.source,
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
    decidedReason: ws.decidedReason,
    chosenNameId: ws.chosenNameId,
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
    messages: ws.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      authorName: m.member?.name ?? null,
      authorColor: m.member?.color ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type WorkspaceState = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
export type NameState = WorkspaceState["names"][number];
