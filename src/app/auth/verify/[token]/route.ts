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

  // A brand-new journey: if they gave their partner's address, send that
  // invite now, while they're watching the dashboard appear.
  if (result.welcome && result.inviteToken && result.workspaceId) {
    await sendPartnerInvite({ workspaceId: result.workspaceId, origin: originFrom(request) }).catch(
      (err) => console.error("[namesake] partner invite failed", err),
    );
  }

  if (!result.workspaceId) {
    return NextResponse.redirect(new URL("/journeys", request.url));
  }

  const dest = new URL(`/w/${result.workspaceId}`, request.url);
  if (result.inviteToken) dest.searchParams.set("invite", result.inviteToken);
  if (result.welcome) dest.searchParams.set("welcome", "1");
  return NextResponse.redirect(dest);
}
