import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth";
import { createJourney, journeyDraft, type JourneyDraft } from "@/lib/journey";
import { PLANS, type PlanKind } from "@/lib/pricing";
import { getStripe, stripeIsLive } from "@/lib/stripe";
import { sendJourneyReadyLink, sendGiftLink } from "@/lib/email";

// Namesake — the money path.
//
// A purchase is the thing that's bought; a journey is what a purchase becomes.
// Keeping them separate is what lets a gift work: the grant is redeemed by
// whoever holds the link, not necessarily the person who paid.

/// Calendar-aware month arithmetic. Plain setMonth() turns Jan 31 into Mar 3;
/// clamping to the last day of the target month is what a person expects.
export function addMonths(from: Date, months: number) {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function redeemCode() {
  return randomBytes(24).toString("base64url");
}

/* --------------------------------------------------------------- creating */

type NewPurchase = {
  kind: PlanKind;
  purchaserEmail: string;
  purchaserName?: string;
  recipientEmail?: string;
  giftMessage?: string;
  draft?: JourneyDraft;
  workspaceId?: string;
};

export async function createPurchase(input: NewPurchase) {
  const plan = PLANS[input.kind];
  return db.purchase.create({
    data: {
      kind: plan.kind,
      months: plan.months,
      amountCents: plan.amountCents,
      currency: plan.currency,
      purchaserEmail: normalizeEmail(input.purchaserEmail),
      purchaserName: input.purchaserName?.trim() || null,
      recipientEmail: input.recipientEmail ? normalizeEmail(input.recipientEmail) : null,
      giftMessage: input.giftMessage?.trim() || null,
      draft: input.draft ? JSON.stringify(input.draft) : null,
      workspaceId: input.workspaceId ?? null,
      redeemCode: redeemCode(),
    },
  });
}

/// Hand the buyer somewhere to pay. With Stripe configured that's a Checkout
/// session; without one it's a local page that can simulate the payment, so the
/// whole flow stays walkable offline.
export async function startCheckout(purchaseId: string, origin: string) {
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return { ok: false as const, error: "That purchase no longer exists." };

  const stripe = getStripe();
  if (!stripe) {
    return { ok: true as const, url: `${origin}/dev/checkout/${purchase.id}`, simulated: true };
  }

  const plan = PLANS[purchase.kind as PlanKind];
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Stripe emails the receipt here, and prefills so they don't retype it.
    customer_email: purchase.purchaserEmail,
    client_reference_id: purchase.id,
    // Read back on the webhook — the only trusted link to our own record.
    metadata: { purchaseId: purchase.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: plan.amountCents,
          product_data: { name: plan.name, description: plan.description },
        },
      },
    ],
    // Where the browser lands. This is a convenience, not the grant — the
    // webhook is what actually marks the purchase paid, so arriving here early
    // just means the redeem page waits a moment for confirmation.
    success_url:
      purchase.kind === "extend"
        ? `${origin}/w/${purchase.workspaceId}?extended=1`
        : `${origin}/redeem/${purchase.redeemCode}`,
    cancel_url:
      purchase.kind === "extend" ? `${origin}/w/${purchase.workspaceId}` : `${origin}/?cancelled=1`,
  });

  if (!session.url) return { ok: false as const, error: "Stripe didn't return a checkout URL." };
  return { ok: true as const, url: session.url, simulated: false };
}

/* ------------------------------------------------------------ fulfillment */

export type FulfillResult =
  | { ok: true; state: "granted" | "extended"; purchaseId: string; redeemUrl?: string }
  | { ok: true; state: "already" }
  | { ok: false; reason: "missing" | "no-workspace" };

/// Mark a purchase paid and apply whatever it bought.
///
/// Called by the Stripe webhook and by the dev bypass, and safe to call more
/// than once — Stripe retries webhooks, and a retry must not buy a second
/// three months. The claim and the effect share a transaction so a purchase
/// can never be marked spent without the thing it paid for landing.
export async function fulfillPurchase(args: {
  purchaseId: string;
  stripeSessionId?: string | null;
  origin: string;
}): Promise<FulfillResult> {
  const outcome = await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: args.purchaseId } });
    if (!purchase) return { state: "missing" as const };
    if (purchase.status !== "pending") return { state: "already" as const };

    const now = new Date();
    const stripeSessionId = args.stripeSessionId ?? purchase.stripeSessionId;

    if (purchase.kind === "extend") {
      if (!purchase.workspaceId) return { state: "no-workspace" as const };
      const ws = await tx.workspace.findUnique({ where: { id: purchase.workspaceId } });
      if (!ws) return { state: "no-workspace" as const };

      // Extend from the current end date, not from today, so buying more time
      // early doesn't quietly throw away the time already paid for.
      const base = ws.expiresAt && ws.expiresAt > now ? ws.expiresAt : now;
      await tx.workspace.update({
        where: { id: ws.id },
        data: { expiresAt: addMonths(base, purchase.months) },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "redeemed", paidAt: now, redeemedAt: now, stripeSessionId },
      });
      return { state: "extended" as const, purchase };
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "paid", paidAt: now, stripeSessionId },
    });
    return { state: "granted" as const, purchase };
  });

  if (outcome.state === "missing") return { ok: false, reason: "missing" };
  if (outcome.state === "no-workspace") return { ok: false, reason: "no-workspace" };
  if (outcome.state === "already") return { ok: true, state: "already" };
  if (outcome.state === "extended") {
    return { ok: true, state: "extended", purchaseId: outcome.purchase.id };
  }

  // Paid and waiting to be claimed — send whoever it's for their link.
  const purchase = outcome.purchase;
  const redeemUrl = `${args.origin}/redeem/${purchase.redeemCode}`;

  if (purchase.kind === "gift" && purchase.recipientEmail) {
    await sendGiftLink(
      purchase.recipientEmail,
      redeemUrl,
      purchase.purchaserName || "Someone who loves you",
      purchase.giftMessage,
    ).catch((err) => console.error("[namesake] gift email failed", err));
  } else {
    await sendJourneyReadyLink(purchase.purchaserEmail, redeemUrl).catch((err) =>
      console.error("[namesake] receipt email failed", err),
    );
  }

  return { ok: true, state: "granted", purchaseId: purchase.id, redeemUrl };
}

/* -------------------------------------------------------------- redeeming */

export type RedeemPurchaseResult =
  | { ok: true; workspaceId: string; inviteToken: string }
  | { ok: false; reason: "invalid" | "unpaid" | "spent" | "needs-details" | "malformed" };

/// Turn a paid grant into an actual journey, owned by whoever redeems it.
///
/// `details` is how a gift recipient supplies the journey — a self-purchase
/// already carries the draft it was bought with.
export async function redeemPurchase(
  code: string,
  ownerUserId: string,
  details?: unknown,
): Promise<RedeemPurchaseResult> {
  const purchase = await db.purchase.findUnique({ where: { redeemCode: code } });
  if (!purchase || purchase.kind === "extend") return { ok: false, reason: "invalid" };
  if (purchase.status === "redeemed") return { ok: false, reason: "spent" };
  if (purchase.status !== "paid") return { ok: false, reason: "unpaid" };

  const source = details ?? (purchase.draft ? JSON.parse(purchase.draft) : null);
  if (!source) return { ok: false, reason: "needs-details" };

  const parsed = journeyDraft.safeParse(source);
  if (!parsed.success) return { ok: false, reason: "malformed" };

  const expiresAt = addMonths(new Date(), purchase.months);

  try {
    return await db.$transaction(async (tx) => {
      // Spend the grant first, conditional on it still being unspent — two
      // clicks on the same link must not yield two journeys.
      const spent = await tx.purchase.updateMany({
        where: { id: purchase.id, status: "paid" },
        data: { status: "redeemed", redeemedAt: new Date() },
      });
      if (spent.count === 0) throw new RedeemConflict();

      const { workspace, partner } = await createJourney(parsed.data, ownerUserId, {
        expiresAt,
        client: tx,
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { workspaceId: workspace.id },
      });

      return { ok: true as const, workspaceId: workspace.id, inviteToken: partner.token };
    });
  } catch (err) {
    if (err instanceof RedeemConflict) return { ok: false, reason: "spent" };
    throw err;
  }
}

class RedeemConflict extends Error {}

/// Whether the dev-only simulate-payment path is available. Real keys or a
/// production build both take it away.
export function paymentsAreSimulated() {
  return !stripeIsLive() && process.env.NODE_ENV !== "production";
}
