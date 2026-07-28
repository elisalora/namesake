import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { journeyDraft } from "@/lib/journey";
import { redeemPurchase } from "@/lib/purchase";
import { sendPartnerInvite } from "@/lib/invite";
import { originFrom } from "@/lib/auth";

const schema = z.object({
  code: z.string().min(1),
  // Gift recipients describe the journey here; a self-purchase already has it.
  details: journeyDraft.optional(),
});

const MESSAGES: Record<string, string> = {
  invalid: "We don't recognise that link.",
  unpaid: "That payment hasn't come through yet. Give it a moment and refresh.",
  spent: "That gift has already been opened.",
  "needs-details": "We still need a few details about the journey.",
  malformed: "Something was missing from those details.",
  "not-yours": "This gift is for someone else — it's theirs to open.",
};

/// Lets the redeem page wait out the gap between Stripe redirecting the browser
/// and the webhook confirming the payment.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Which purchase?" }, { status: 400 });

  const purchase = await db.purchase.findUnique({
    where: { redeemCode: code },
    select: { status: true },
  });
  if (!purchase) return NextResponse.json({ error: "Unknown." }, { status: 404 });

  return NextResponse.json({ status: purchase.status });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the details and try again." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const result = await redeemPurchase(parsed.data.code, user, parsed.data.details);
  if (!result.ok) {
    const status = result.reason === "unpaid" ? 409 : result.reason === "not-yours" ? 403 : 400;
    return NextResponse.json({ error: MESSAGES[result.reason] ?? "That didn't work." }, { status });
  }

  // Give the new owner a name if we've never had one for them.
  if (!user.name) {
    const owner = await db.member.findFirst({
      where: { workspaceId: result.workspaceId, userId: user.id },
    });
    if (owner) await db.user.update({ where: { id: user.id }, data: { name: owner.name } });
  }

  // If they named a partner with an email, invite them straight away. The
  // journey exists either way — the grant is spent and failing the request now
  // would strand it — so this stays best-effort. But it reports back, because a
  // partner who was never emailed is otherwise invisible until someone asks why
  // they never arrived; the dashboard's own invite card is the way to retry.
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

  return NextResponse.json({
    ok: true,
    workspaceId: result.workspaceId,
    inviteToken: result.inviteToken,
    partnerInvited: invite.ok ? invite.email : null,
  });
}
