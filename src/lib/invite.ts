import { db } from "@/lib/db";
import { issueLoginLink } from "@/lib/auth";
import { sendInviteLink, emailFallsBackToConsole } from "@/lib/email";

/// Email the empty seat in a journey. Used right after a journey is created
/// (when the owner gave their partner's address) and again from the dashboard
/// if the first one never landed.
export async function sendPartnerInvite(args: {
  workspaceId: string;
  origin: string;
  fromName?: string;
  email?: string;
}): Promise<
  | { ok: true; email: string; devUrl?: string }
  | { ok: false; error: string; reason: "input" | "undeliverable" }
> {
  const ws = await db.workspace.findUnique({
    where: { id: args.workspaceId },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });
  if (!ws) {
    return { ok: false as const, reason: "input" as const, error: "That journey no longer exists." };
  }

  const seat = ws.members.find((m) => !m.userId);
  if (!seat) {
    return { ok: false as const, reason: "input" as const, error: "Both of you are already here." };
  }

  const to = args.email?.trim() || seat.email;
  if (!to) {
    return {
      ok: false as const,
      reason: "input" as const,
      error: "Add your partner's email address first.",
    };
  }

  const link = await issueLoginLink({
    email: to,
    purpose: "invite",
    memberId: seat.id,
    origin: args.origin,
  });
  if (!link.ok) return { ok: false as const, reason: "input" as const, error: link.error };

  // Remember the address so a later resend doesn't need it typed again.
  if (seat.email !== link.email) {
    await db.member.update({ where: { id: seat.id }, data: { email: link.email } });
  }

  const inviter = args.fromName || ws.members.find((m) => m.isOwner)?.name || "Your partner";
  const sent = await sendInviteLink(link.email, link.url, inviter, ws.babyLabel);

  // Same reasoning as the sign-in path: an invite carries a login link and there
  // is no password to fall back on, so a swallowed send leaves the partner
  // unable to get in while the dashboard says they were emailed. The one
  // undelivered send that is still fine is the local console fallback.
  if (!sent.delivered && !emailFallsBackToConsole()) {
    return {
      ok: false as const,
      reason: "undeliverable" as const,
      error: sent.error ?? "We couldn't send that invitation. Try again in a moment.",
    };
  }

  return {
    ok: true as const,
    email: link.email,
    // Dev convenience only — never handed out once real mail is configured.
    devUrl: emailFallsBackToConsole() ? link.url : undefined,
  };
}
