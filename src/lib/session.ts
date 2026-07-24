import { cache } from "react";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Authorization lives here, next to the data, so every route handler and page
// asks the same question the same way: "does the signed-in person hold a seat
// in *this* journey?" Identity now comes from a verified email address; the
// shape of these helpers is unchanged from the token-cookie days.

/// The signed-in person's seat in a given journey, or null if they haven't got
/// one. Memoized per render pass so a page that checks twice only queries once.
export const getMemberForWorkspace = cache(async (workspaceId: string) => {
  const user = await getCurrentUser();
  if (!user) return null;

  return db.member.findFirst({
    where: { workspaceId, userId: user.id },
  });
});

/// True once the paid window has closed. A null `expiresAt` means the journey
/// predates billing — grandfathered, never expires.
export function hasExpired(workspace: { expiresAt: Date | null }) {
  return Boolean(workspace.expiresAt && workspace.expiresAt.getTime() <= Date.now());
}

export type WriteAccess =
  | { ok: true; member: NonNullable<Awaited<ReturnType<typeof getMemberForWorkspace>>> }
  | { ok: false; status: 403 | 402 };

/// The question every *mutating* route asks: is this person a member, and is
/// the journey still inside its paid window?
///
/// An expired journey is deliberately readable but not writable — nothing a
/// couple wrote is ever taken away from them, they just can't add to it until
/// they extend. 402 is the honest status for that: it's not that they may not,
/// it's that it hasn't been paid for.
export async function getWritableMember(workspaceId: string): Promise<WriteAccess> {
  const member = await getMemberForWorkspace(workspaceId);
  if (!member) return { ok: false, status: 403 };

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { expiresAt: true },
  });
  if (!workspace) return { ok: false, status: 403 };
  if (hasExpired(workspace)) return { ok: false, status: 402 };

  return { ok: true, member };
}

/// The refusal that goes with a failed write check, so every route says the
/// same thing the same way.
export function writeDenied(access: Extract<WriteAccess, { ok: false }>) {
  return NextResponse.json(
    { error: access.status === 402 ? "journey_expired" : "not_a_member" },
    { status: access.status },
  );
}
