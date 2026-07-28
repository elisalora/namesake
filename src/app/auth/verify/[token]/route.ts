import { NextResponse } from "next/server";
import { redeemLoginLink, originFrom } from "@/lib/auth";
import { sendPartnerInvite } from "@/lib/invite";

// The other end of every magic link: spend the token, sign the person in, and
// drop them exactly where the link promised.
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await redeemLoginLink(token);

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/signin?error=${result.reason}`, request.url));
  }

  // Signed in on the way to somewhere specific — claiming a gift, say.
  if (result.returnTo) {
    return NextResponse.redirect(new URL(result.returnTo, request.url));
  }

  // A brand-new journey: if they gave their partner's address, send that
  // invite now, while they're watching the dashboard appear.
  //
  // Best-effort on purpose: they are mid-redirect and the journey is already
  // theirs. An undeliverable send is logged rather than swallowed, and the
  // welcome modal they land on still offers the invite form for the seat, so
  // nothing here claims a partner was emailed when they weren't.
  if (result.welcome && result.inviteToken && result.workspaceId) {
    const invite = await sendPartnerInvite({
      workspaceId: result.workspaceId,
      origin: originFrom(request),
    }).catch((err) => {
      console.error("[namesake] partner invite failed", err);
      return { ok: false as const, reason: "undeliverable" as const, error: String(err) };
    });
    if (!invite.ok && invite.reason === "undeliverable") {
      console.error(`[namesake] partner invite was not delivered: ${invite.error}`);
    }
  }

  if (!result.workspaceId) {
    return NextResponse.redirect(new URL("/journeys", request.url));
  }

  const dest = new URL(`/w/${result.workspaceId}`, request.url);
  if (result.inviteToken) dest.searchParams.set("invite", result.inviteToken);
  if (result.welcome) dest.searchParams.set("welcome", "1");
  return NextResponse.redirect(dest);
}
