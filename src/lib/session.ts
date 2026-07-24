import { cache } from "react";
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
