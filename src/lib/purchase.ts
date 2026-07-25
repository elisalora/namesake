import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth";
import {
  createJourney,
  journeyDraft,
  reserveSuggestSlug,
  type JourneyDraft,
} from "@/lib/journey";
import {
  TIERS,
  EXTEND,
  ADD_ONS,
  type AddOnId,
  type TierId,
  type AccessWindow,
} from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { sendJourneyReadyLink, sendGiftLink, sendBoxOnItsWay } from "@/lib/email";

// Namesake — the money path.
//
// A purchase is the thing that's bought; a journey is what a purchase becomes.
// Keeping them separate is what lets a gift work: the grant is redeemed by
// whoever holds the code — which, for a boxed tier, is whoever was handed the
// box, not whoever paid.

/// Calendar-aware month arithmetic. Plain setMonth() turns Jan 31 into Mar 3;
/// clamping to the last day of the target month is what a person expects.
export function addMonths(from: Date, months: number) {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 86_400_000);
}

/// Work out when a grant runs out.
///
/// A fixed-month window starts the day it's opened. A due-date window can't be
/// known until the couple says when they're due, which is why it's resolved
/// here at redemption rather than at purchase — and why there's a fallback for
/// couples who'd rather not say.
export function resolveExpiry(
  purchase: {
    expiryRule: string;
    months: number | null;
    graceDays: number | null;
    fallbackMonths: number | null;
  },
  from: Date,
  dueDate?: Date | null,
) {
  if (purchase.expiryRule === "due_date_grace") {
    if (dueDate && dueDate.getTime() > from.getTime()) {
      return addDays(dueDate, purchase.graceDays ?? 7);
    }
    return addMonths(from, purchase.fallbackMonths ?? 9);
  }
  return addMonths(from, purchase.months ?? 1);
}

function windowColumns(window: AccessWindow) {
  return window.rule === "months"
    ? { expiryRule: "months", months: window.months, graceDays: null, fallbackMonths: null }
    : {
        expiryRule: "due_date_grace",
        months: null,
        graceDays: window.graceDays,
        fallbackMonths: window.fallbackMonths,
      };
}

function redeemCode() {
  return randomBytes(24).toString("base64url");
}

/* --------------------------------------------------------------- creating */

type NewGiftOrJourney = {
  tier: TierId;
  purchaserEmail: string;
  purchaserName?: string;
  recipientEmail?: string;
  giftMessage?: string;
  draft?: JourneyDraft;
  addOns?: AddOnId[];
};

/// Create the purchase and its packing list. The line items are what actually
/// has to be put in a box, so the tier itself is one of them.
export async function createPurchase(input: NewGiftOrJourney) {
  const tier = TIERS[input.tier];
  const addOns = (input.addOns ?? []).map((id) => ADD_ONS[id]).filter(Boolean);

  const items = [
    {
      sku: tier.id,
      name: tier.name,
      amountCents: tier.amountCents,
      physical: tier.physical,
      shipsAfterNaming: false,
    },
    ...addOns.map((a) => ({
      sku: a.id,
      name: a.name,
      amountCents: a.amountCents,
      physical: a.physical,
      shipsAfterNaming: Boolean(a.shipsAfterNaming),
    })),
  ];

  const amountCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  const needsShipping = items.some((i) => i.physical);

  return db.purchase.create({
    data: {
      tier: tier.id,
      kind: tier.kind,
      ...windowColumns(tier.window),
      amountCents,
      currency: tier.currency,
      purchaserEmail: normalizeEmail(input.purchaserEmail),
      purchaserName: input.purchaserName?.trim() || null,
      recipientEmail: input.recipientEmail ? normalizeEmail(input.recipientEmail) : null,
      giftMessage: input.giftMessage?.trim() || null,
      draft: input.draft ? JSON.stringify(input.draft) : null,
      needsShipping,
      redeemCode: redeemCode(),
      // Reserved now so a shower card can be printed and packed before the
      // journey exists to point at.
      suggestSlug: reserveSuggestSlug(),
      items: { create: items },
    },
    include: { items: true },
  });
}

export async function createExtension(workspaceId: string, purchaserEmail: string, name?: string) {
  return db.purchase.create({
    data: {
      tier: EXTEND.id,
      kind: "extend",
      ...windowColumns(EXTEND.window),
      amountCents: EXTEND.amountCents,
      currency: EXTEND.currency,
      purchaserEmail: normalizeEmail(purchaserEmail),
      purchaserName: name?.trim() || null,
      workspaceId,
      redeemCode: redeemCode(),
      items: {
        create: [
          {
            sku: EXTEND.id,
            name: EXTEND.name,
            amountCents: EXTEND.amountCents,
            physical: false,
          },
        ],
      },
    },
    include: { items: true },
  });
}

/// Hand the buyer somewhere to pay. With Stripe configured that's a Checkout
/// session; without one it's a local page that can simulate the payment, so the
/// whole flow stays walkable offline.
export async function startCheckout(purchaseId: string, origin: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true },
  });
  if (!purchase) return { ok: false as const, error: "That purchase no longer exists." };

  const stripe = getStripe();
  if (!stripe) {
    // The simulate-payment page only exists in development. Deployed without a
    // Stripe key there is nowhere to send a buyer, so say so plainly rather
    // than handing them a link that 404s.
    if (!paymentsAreSimulated()) {
      console.error("[namesake] checkout attempted with no STRIPE_SECRET_KEY configured");
      return {
        ok: false as const,
        error: "Payments aren't set up yet. Nothing has been charged.",
      };
    }
    return { ok: true as const, url: `${origin}/dev/checkout/${purchase.id}`, simulated: true };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: purchase.purchaserEmail,
    client_reference_id: purchase.id,
    metadata: { purchaseId: purchase.id },
    // One line per thing bought, so the Stripe receipt reads like the packing
    // list rather than a single opaque total.
    line_items: purchase.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: purchase.currency,
        unit_amount: item.amountCents,
        product_data: { name: item.name },
      },
    })),
    // Anything in the box means we need somewhere to send it.
    ...(purchase.needsShipping
      ? { shipping_address_collection: { allowed_countries: shippingCountries() } }
      : {}),
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

function shippingCountries() {
  const raw = process.env.NAMESAKE_SHIPPING_COUNTRIES?.trim();
  const list = (raw ? raw.split(",") : ["US", "CA", "GB", "AU", "NZ", "IE"])
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return list as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
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
/// month. The claim and the effect share a transaction so a purchase can never
/// be marked spent without the thing it paid for landing.
export async function fulfillPurchase(args: {
  purchaseId: string;
  stripeSessionId?: string | null;
  shipping?: { name?: string | null; address?: unknown } | null;
  origin: string;
}): Promise<FulfillResult> {
  const outcome = await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: args.purchaseId } });
    if (!purchase) return { state: "missing" as const };
    if (purchase.status !== "pending") return { state: "already" as const };

    const now = new Date();
    const stripeSessionId = args.stripeSessionId ?? purchase.stripeSessionId;
    const shipping = args.shipping?.address
      ? {
          shippingName: args.shipping.name ?? null,
          shippingAddress: JSON.stringify(args.shipping.address),
        }
      : {};

    if (purchase.kind === "extend") {
      if (!purchase.workspaceId) return { state: "no-workspace" as const };
      const ws = await tx.workspace.findUnique({ where: { id: purchase.workspaceId } });
      if (!ws) return { state: "no-workspace" as const };

      // Extend from the current end date, not from today, so buying more time
      // early doesn't quietly throw away the time already paid for.
      const base = ws.expiresAt && ws.expiresAt > now ? ws.expiresAt : now;
      await tx.workspace.update({
        where: { id: ws.id },
        data: { expiresAt: resolveExpiry(purchase, base) },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "redeemed", paidAt: now, redeemedAt: now, stripeSessionId, ...shipping },
      });
      return { state: "extended" as const, purchase };
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "paid", paidAt: now, stripeSessionId, ...shipping },
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

  if (purchase.kind === "gift") {
    if (purchase.recipientEmail) {
      await sendGiftLink(
        purchase.recipientEmail,
        redeemUrl,
        purchase.purchaserName || "Someone who loves you",
        purchase.giftMessage,
      ).catch((err) => console.error("[namesake] gift email failed", err));
    }
    if (purchase.needsShipping) {
      // The buyer is the one who needs to know a box is coming — and, when
      // there's no recipient address, they're holding the only copy of the
      // redeem link until the box reaches the couple.
      await sendBoxOnItsWay(
        purchase.purchaserEmail,
        redeemUrl,
        Boolean(purchase.recipientEmail),
      ).catch((err) => console.error("[namesake] box email failed", err));
    }
  } else {
    await sendJourneyReadyLink(purchase.purchaserEmail, redeemUrl).catch((err) =>
      console.error("[namesake] receipt email failed", err),
    );
  }

  return { ok: true, state: "granted", purchaseId: purchase.id, redeemUrl };
}

/* -------------------------------------------------------------- redeeming */

export type RedeemPurchaseResult =
  | { ok: true; workspaceId: string; inviteToken: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "unpaid" | "spent" | "needs-details" | "malformed" };

/// Turn a paid grant into an actual journey, owned by whoever redeems it.
///
/// `details` is how a gift recipient supplies the journey — a self-purchase
/// already carries the draft it was bought with. The due date they give here is
/// what resolves a due-date-relative window.
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

  const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  const expiresAt = resolveExpiry(
    purchase,
    new Date(),
    dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
  );

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
        suggestSlug: purchase.suggestSlug,
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { workspaceId: workspace.id },
      });

      return {
        ok: true as const,
        workspaceId: workspace.id,
        inviteToken: partner.token,
        expiresAt,
      };
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
  return !getStripe() && process.env.NODE_ENV !== "production";
}
