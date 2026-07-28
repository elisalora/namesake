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
import { sendJourneyReadyLink, sendGiftLink, sendBoxOnItsWay, sendKeepsakeOrdered } from "@/lib/email";

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

/// A comped gift — access granted free, for feedback or as a present from the
/// makers. To a recipient it's an ordinary gift: they open a link, sign in, and
/// describe their journey. But it's born already `paid`, so it never touches
/// checkout — no card, real or fake. It grants only the journey; the dropship
/// keepsake upsell still waits for them at the end, at full price.
export async function createCompGift(input: {
  createdByEmail: string;
  fromName?: string;
  message?: string;
  months?: number;
  /// Optional. Given one, the caller mails the link straight to them; without
  /// one the code is yours to hand over however you like, which is what makes
  /// this work for a text message or a card as readily as an inbox.
  recipientEmail?: string;
}) {
  const months = input.months && input.months > 0 ? input.months : 6;
  return db.purchase.create({
    data: {
      tier: "comp",
      kind: "gift",
      expiryRule: "months",
      months,
      graceDays: null,
      fallbackMonths: null,
      amountCents: 0,
      currency: "usd",
      purchaserEmail: normalizeEmail(input.createdByEmail),
      purchaserName: input.fromName?.trim() || "Someone who loves you",
      recipientEmail: input.recipientEmail ? normalizeEmail(input.recipientEmail) : null,
      giftMessage: input.message?.trim() || null,
      // The whole point: granted the moment it's made, so redemption is all
      // that's left.
      status: "paid",
      paidAt: new Date(),
      needsShipping: false,
      redeemCode: redeemCode(),
      suggestSlug: reserveSuggestSlug(),
      items: {
        create: [{ sku: "comp", name: "Namesake journey (gift)", amountCents: 0, physical: false }],
      },
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

/// A keepsake bought after the name is chosen, tied to the journey it belongs
/// to. It grants no time — it's an order to make and ship a personalized
/// object — so the name is written onto the line item itself, which is exactly
/// what the packing list reads. Twins are simply two lines, one per baby, which
/// is where the second sale comes from.
export async function createKeepsakeOrder(input: {
  workspaceId: string;
  purchaserEmail: string;
  purchaserName?: string;
  lines: { addOn: AddOnId; personalization?: string | null }[];
}) {
  const items = input.lines
    .map(({ addOn, personalization }) => {
      const a = ADD_ONS[addOn];
      if (!a) return null;
      return {
        sku: a.id,
        // The name rides on the item so it appears on both the Stripe receipt
        // and the fulfillment packing list — no separate field to keep in sync.
        name: personalization ? `${a.name} · ${personalization}` : a.name,
        amountCents: a.amountCents,
        physical: a.physical,
        shipsAfterNaming: Boolean(a.shipsAfterNaming),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) return null;

  const amountCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  return db.purchase.create({
    data: {
      tier: "keepsake",
      kind: "keepsake",
      expiryRule: "months",
      months: null,
      amountCents,
      currency: "usd",
      purchaserEmail: normalizeEmail(input.purchaserEmail),
      purchaserName: input.purchaserName?.trim() || null,
      workspaceId: input.workspaceId,
      needsShipping: true,
      redeemCode: redeemCode(),
      items: { create: items },
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
        : purchase.kind === "keepsake"
          ? `${origin}/w/${purchase.workspaceId}?keepsake=thanks`
          : // `?bought=1` marks the browser Stripe just sent back as the buyer's,
            // not the recipient's. It matters for a gift: the redeem link is a
            // bearer token, and without this the person who paid lands on the
            // form that opens the present under their own account. The redeem
            // page turns it into a receipt when the gift is going to someone
            // else, and ignores it when the buyer is the one who needs the code.
            `${origin}/redeem/${purchase.redeemCode}?bought=1`,
    cancel_url:
      purchase.kind === "extend" || purchase.kind === "keepsake"
        ? `${origin}/w/${purchase.workspaceId}`
        : `${origin}/?cancelled=1`,
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
  stripePaymentIntentId?: string | null;
  shipping?: { name?: string | null; address?: unknown } | null;
  origin: string;
}): Promise<FulfillResult> {
  const outcome = await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: args.purchaseId } });
    if (!purchase) return { state: "missing" as const };
    if (purchase.status !== "pending") return { state: "already" as const };

    const now = new Date();
    const stripeSessionId = args.stripeSessionId ?? purchase.stripeSessionId;
    // Recorded here and nowhere else: this is the only moment we hold both the
    // purchase and the charge behind it. A refund arrives later as a charge
    // event with no session on it, and this is what makes it findable.
    const stripePaymentIntentId = args.stripePaymentIntentId ?? purchase.stripePaymentIntentId;
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
      //
      // A null `expiresAt` is not "already over" — it means the journey predates
      // billing and never ends (`session.ts`, `hasExpired`). Writing a date onto
      // it would make paying for more time the one action that takes it away, so
      // the extension is recorded and the journey keeps its unlimited window.
      // Checkout refuses these before any money moves; this is the backstop for
      // a purchase that was already in flight.
      if (ws.expiresAt === null) {
        await tx.purchase.update({
          where: { id: purchase.id },
          data: { status: "redeemed", paidAt: now, redeemedAt: now, stripeSessionId, stripePaymentIntentId, ...shipping },
        });
        console.warn(
          `[namesake] extension ${purchase.id} applied to journey ${ws.id}, which never expires — ` +
            `left unlimited. This one is worth refunding.`,
        );
        return { state: "extended" as const, purchase };
      }

      const base = ws.expiresAt > now ? ws.expiresAt : now;
      await tx.workspace.update({
        where: { id: ws.id },
        data: { expiresAt: resolveExpiry(purchase, base) },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "redeemed", paidAt: now, redeemedAt: now, stripeSessionId, stripePaymentIntentId, ...shipping },
      });
      return { state: "extended" as const, purchase };
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: "paid", paidAt: now, stripeSessionId, stripePaymentIntentId, ...shipping },
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

  if (purchase.kind === "keepsake") {
    // No link to redeem — it's already tied to their journey. Just a warm
    // confirmation that a made thing is coming.
    await sendKeepsakeOrdered(
      purchase.purchaserEmail,
      `${args.origin}/w/${purchase.workspaceId}/keepsake`,
    ).catch((err) => console.error("[namesake] keepsake email failed", err));
  } else if (purchase.kind === "gift") {
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

/* ------------------------------------------------- refunds and disputes */

/// Find the purchase behind a charge.
///
/// Refunds and disputes are charge events. They carry a payment intent, never a
/// checkout session — and until this change the only Stripe id on a purchase
/// was the session's, which is why none of them could be matched to anything.
///
/// New purchases record the intent at fulfillment. Anything paid for before
/// that has to be looked up the long way round: ask Stripe which session the
/// intent belongs to, then match on the session id we do have. One extra API
/// call, on an event that arrives a handful of times a year.
/// Takes the intent rather than the charge because a dispute is not a charge —
/// it carries its own `payment_intent`, and going via the charge id would cost
/// a second round trip to learn what the event already told us.
async function findPurchaseForIntent(source: {
  payment_intent?: string | { id: string } | null;
}) {
  const intentId =
    typeof source.payment_intent === "string" ? source.payment_intent : source.payment_intent?.id;
  if (!intentId) return null;

  const direct = await db.purchase.findUnique({ where: { stripePaymentIntentId: intentId } });
  if (direct) return direct;

  const stripe = getStripe();
  if (!stripe) return null;

  const sessions = await stripe.checkout.sessions
    .list({ payment_intent: intentId, limit: 1 })
    .catch((err) => {
      console.error("[namesake] could not look up the session for", intentId, err);
      return null;
    });
  const sessionId = sessions?.data[0]?.id;
  if (!sessionId) return null;

  const found = await db.purchase.findUnique({ where: { stripeSessionId: sessionId } });
  // Backfill it, so a second event about the same charge doesn't pay the toll
  // again — a dispute is usually followed by a resolution.
  if (found && !found.stripePaymentIntentId) {
    await db.purchase
      .update({ where: { id: found.id }, data: { stripePaymentIntentId: intentId } })
      .catch(() => {});
  }
  return found;
}

/// What a purchase's status should be when the money is no longer in question —
/// which is not always `paid`, because the grant may already have been claimed.
function settledStatus(purchase: { redeemedAt: Date | null }) {
  return purchase.redeemedAt ? "redeemed" : "paid";
}

export type MoneyBackResult =
  | { ok: true; purchaseId: string; state: "refunded" | "disputed" | "restored" | "unchanged" }
  | { ok: false; reason: "unknown-charge" | "partial" };

/// The money went back. Record it, and stop the grant if nobody has used it.
///
/// The rule, deliberately: a refund closes an *unopened* grant and leaves an
/// opened one alone. Someone who was refunded before redeeming has had the
/// whole transaction undone and should not still be holding a working link.
/// Someone who has already opened the journey has written in it — names,
/// reasons, a conversation with the consultant — and taking that away over a
/// $10 refund is the worst last impression the product could leave. The money
/// is separable from the journey here in a way it isn't in most software.
///
/// So: `status` becomes `refunded` either way (it describes the money, and the
/// packing list and the redeem check both read it), and `redeemedAt` is
/// untouched, so an opened journey stays opened and its owner keeps their
/// access. Nothing revokes a workspace.
export async function refundPurchase(charge: Stripe.Charge): Promise<MoneyBackResult> {
  const purchase = await findPurchaseForIntent(charge);
  if (!purchase) return { ok: false, reason: "unknown-charge" };

  // `charge.refunded` also fires for partial refunds — a shipping adjustment,
  // a goodwill discount — and those buy nothing back. Only a charge refunded
  // down to nothing undoes the purchase.
  if (charge.amount_refunded < charge.amount) return { ok: false, reason: "partial" };

  if (purchase.status === "refunded") {
    return { ok: true, purchaseId: purchase.id, state: "unchanged" };
  }

  await db.purchase.update({
    where: { id: purchase.id },
    data: { status: "refunded", refundedAt: new Date() },
  });

  if (purchase.needsShipping && !purchase.fulfilledAt) {
    console.warn(
      `[namesake] refunded ${purchase.id} was still waiting to be packed — pulled from the list.`,
    );
  }

  return { ok: true, purchaseId: purchase.id, state: "refunded" };
}

/// A chargeback has been opened. Not a refund yet — the bank may side with us —
/// but a box posted now is a box posted against money that is being taken back,
/// and an unopened grant claimed now is one claimed while the payment for it is
/// contested. Both stop until it resolves.
export async function disputePurchase(dispute: Stripe.Dispute): Promise<MoneyBackResult> {
  const purchase = await findPurchaseForIntent(dispute);
  if (!purchase) return { ok: false, reason: "unknown-charge" };
  if (purchase.status === "refunded" || purchase.status === "disputed") {
    return { ok: true, purchaseId: purchase.id, state: "unchanged" };
  }

  await db.purchase.update({ where: { id: purchase.id }, data: { status: "disputed" } });
  return { ok: true, purchaseId: purchase.id, state: "disputed" };
}

/// A dispute closed. Won means the money stayed with us and the purchase goes
/// back to exactly where it was — including `redeemed`, if the journey had
/// already been opened when the chargeback landed. Lost means the money is
/// gone, which is a refund by another name.
export async function resolveDispute(
  dispute: Stripe.Dispute,
  outcome: "won" | "lost",
): Promise<MoneyBackResult> {
  const purchase = await findPurchaseForIntent(dispute);
  if (!purchase) return { ok: false, reason: "unknown-charge" };

  if (outcome === "lost") {
    if (purchase.status === "refunded") {
      return { ok: true, purchaseId: purchase.id, state: "unchanged" };
    }
    await db.purchase.update({
      where: { id: purchase.id },
      data: { status: "refunded", refundedAt: new Date() },
    });
    return { ok: true, purchaseId: purchase.id, state: "refunded" };
  }

  // Only undo what the dispute itself did. A purchase refunded outright while
  // the dispute was open stays refunded.
  if (purchase.status !== "disputed") {
    return { ok: true, purchaseId: purchase.id, state: "unchanged" };
  }
  await db.purchase.update({
    where: { id: purchase.id },
    data: { status: settledStatus(purchase) },
  });
  return { ok: true, purchaseId: purchase.id, state: "restored" };
}

/* -------------------------------------------------------------- redeeming */

export type RedeemPurchaseResult =
  | { ok: true; workspaceId: string; inviteToken: string; expiresAt: Date }
  | {
      ok: false;
      reason:
        | "invalid"
        | "unpaid"
        | "payment-reversed"
        | "spent"
        | "needs-details"
        | "malformed"
        | "not-yours";
    };

/// Whether this grant is one the person holding it bought *for someone else*.
///
/// Checkout sends the buyer to the redeem link when they pay, and a gift is
/// claimed by whoever opens it — so a signed-in gifter is one form away from
/// opening the present they just bought, under their own account, with no way
/// back: the code is spent and the person it was for is told it has already
/// been claimed.
///
/// Deliberately narrow. Buying a boxed tier for yourself is a real thing people
/// do, and there the buyer *is* the recipient; this only fires when a different
/// address was named as the destination.
export function boughtForSomeoneElse(
  purchase: { kind: string; purchaserEmail: string; recipientEmail: string | null },
  redeemerEmail: string,
) {
  if (purchase.kind !== "gift" || !purchase.recipientEmail) return false;
  const redeemer = normalizeEmail(redeemerEmail);
  return (
    redeemer === normalizeEmail(purchase.purchaserEmail) &&
    redeemer !== normalizeEmail(purchase.recipientEmail)
  );
}

/// Turn a paid grant into an actual journey, owned by whoever redeems it.
///
/// `details` is how a gift recipient supplies the journey — a self-purchase
/// already carries the draft it was bought with. The due date they give here is
/// what resolves a due-date-relative window.
export async function redeemPurchase(
  code: string,
  owner: { id: string; email: string },
  details?: unknown,
): Promise<RedeemPurchaseResult> {
  const ownerUserId = owner.id;
  const purchase = await db.purchase.findUnique({ where: { redeemCode: code } });
  // Only journeys and gifts become workspaces. An extension or a keepsake is
  // tied to an existing journey and has nothing to redeem.
  if (!purchase || purchase.kind === "extend" || purchase.kind === "keepsake") {
    return { ok: false, reason: "invalid" };
  }
  if (purchase.status === "redeemed") return { ok: false, reason: "spent" };
  // Money back, and nobody had opened it — the transaction is undone, so the
  // link that was paid for stops working. Said plainly rather than folded into
  // "unpaid", which would tell someone to wait for a payment that is not coming.
  //
  // One reason covers both states on purpose. Stripe withdraws the funds the
  // moment a dispute opens, so "the payment was reversed" is true of each, and
  // the person holding a gift link is owed an explanation without being told
  // about a chargeback on somebody else's card.
  if (purchase.status === "refunded" || purchase.status === "disputed") {
    return { ok: false, reason: "payment-reversed" };
  }
  if (purchase.status !== "paid") return { ok: false, reason: "unpaid" };
  if (boughtForSomeoneElse(purchase, owner.email)) return { ok: false, reason: "not-yours" };

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
