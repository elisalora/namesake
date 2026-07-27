import { db } from "@/lib/db";

// Whose turn it is to be answered.
//
// The consultant is one conversation shared by two people, and a reply takes
// long enough that both of them can be waiting on it at once. Everything here
// exists to make sure only one question is in flight per journey, so a reply
// is never composed from a transcript that is missing the question sitting
// beside it.

/// How long a turn may hold the conversation before we assume its server died.
///
/// A real turn can take a while — the consultant walks a ladder of models and
/// retries the ones that are merely busy — but a process killed mid-stream
/// never gets to give anything back, and a lock nobody will ever clear would
/// shut the other parent out permanently. Long enough that a slow honest turn
/// is never mistaken for wreckage.
export const TURN_STALE_MS = 90_000;

function cutoff() {
  return new Date(Date.now() - TURN_STALE_MS);
}

/// Take the conversation for one member, if nobody else holds it.
///
/// One conditional UPDATE, deliberately: two requests arriving in the same
/// instant are serialised by the database and the loser matches zero rows.
/// Reading and then writing would let both of them read "free" before either
/// wrote — and the two parents are on different servers as often as not, so
/// there is no shared memory to lock instead.
export async function claimTurn(workspaceId: string, memberId: string): Promise<boolean> {
  const { count } = await db.workspace.updateMany({
    where: {
      id: workspaceId,
      OR: [{ turnStartedAt: null }, { turnStartedAt: { lt: cutoff() } }],
    },
    data: { turnMemberId: memberId, turnStartedAt: new Date() },
  });
  return count === 1;
}

/// Give it back.
///
/// Scoped to the holder, so a turn that overran and was declared dead can't
/// then clear the turn of whoever rightfully took over — it would be handing
/// away someone else's place in the queue on its way out.
export async function releaseTurn(workspaceId: string, memberId: string) {
  await db.workspace.updateMany({
    where: { id: workspaceId, turnMemberId: memberId },
    data: { turnMemberId: null, turnStartedAt: null },
  });
}

/// Who holds the conversation right now, ignoring a lock old enough to be
/// wreckage. The route and the screen ask this same question, so "someone is
/// asking" means one thing in both places.
export function turnHolder(ws: {
  turnMemberId: string | null;
  turnStartedAt: Date | null;
}): string | null {
  if (!ws.turnMemberId || !ws.turnStartedAt) return null;
  return ws.turnStartedAt > cutoff() ? ws.turnMemberId : null;
}
