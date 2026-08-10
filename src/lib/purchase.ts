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
  TRIAL,
  UPGRADE,
  ADD_ONS,
  type AddOnId,
  type TierId,
  type AccessWindow,
} from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { sendJourneyReadyLink, sendGiftLink, sendBoxOnItsWay, sendKeepsakeOrdered } from "@/lib/email";
import { trackFunnel } from "@/lib/analytics";
import { FUNNEL } from "@/lib/funnel";
import { parseDueDate } from "@/lib/dates";

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
      const end = addDays(dueDate, purchase.graceDays ?? 7);
      // Check the result, not just the input. The old guard here asked only
      // whether the date parsed — so `+275760-09-12`, the largest Date
      // JavaScript has, sailed through it and then overflowed on `+7 days`,
      // making `Invalid Date` the end of somebody's paid window. Bounding the
      // input in lib/dates.ts is what actually prevents this; this is the
      // line that stops a future change to those bounds from being silent.
      if (!Number.isNaN(end.getTime())) return end;
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

/// A trial journey, granted to nobody in particular until somebody proves an
/// email address.
///
/// This is a Purchase for the same reason a comp is one: in this product a
/// journey cannot come into existence except by redeeming a grant, and putting
/// a second way in beside that would mean a second copy of every rule about
/// who owns what. Born `paid`, worth nothing, and redeemed exactly the way a
/// self-purchase is — which is also what keeps the sequencing intact. The
/// workspace is created on the far side of a magic link, so the person who
/// owns it has a verified address, and the free-turn count has something to
/// hang on. Without that, a new address is a new trial and the counter is
/// decoration.
export async function createTrialGrant(input: { draft: JourneyDraft }) {
  return db.purchase.create({
    data: {
      tier: TRIAL.id,
      kind: "journey",
      expiryRule: "months",
      months: TRIAL.months,
      amountCents: 0,
      currency: TRIAL.currency,
      purchaserEmail: normalizeEmail(input.draft.you.email),
      purchaserName: input.draft.you.name,
      draft: JSON.stringify(input.draft),
      // Granted the moment it is made — there is nothing to pay, so there is
      // nothing to wait for.
      status: "paid",
      paidAt: new Date(),
      needsShipping: false,
      redeemCode: redeemCode(),
      suggestSlug: reserveSuggestSlug(),
      items: {
        create: [{ sku: TRIAL.id, name: TRIAL.name, amountCents: 0, physical: false }],
      },
    },
    include: { items: true },
  });
}

/// Buying the journey they are already in.
///
/// Shaped as an `extend` rather than a `journey`, because the workspace exists
/// and everything in it is theirs — a `journey` purchase would build them a
/// second, empty one and leave the shortlist they came for behind. That means
/// `fulfillPurchase` needs no new branch: it pushes the window out from
/// wherever it currently ends, and clears `isTrial` on the way past.
export async function createUpgrade(workspaceId: string, purchaserEmail: string, name?: string) {
  return db.purchase.create({
    data: {
      tier: TIERS.self_serve.id,
      kind: "extend",
      ...windowColumns(UPGRADE.window),
      amountCents: UPGRADE.amountCents,
      currency: UPGRADE.currency,
      purchaserEmail: normalizeEmail(purchaserEmail),
      purchaserName: name?.trim() || null,
      workspaceId,
      redeemCode: redeemCode(),
      items: {
        create: [
          {
            sku: TIERS.self_serve.id,
            name: UPGRADE.name,
            amountCents: UPGRADE.amountCents,
            physical: false,
          },
        ],
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
  shipping?: { name?: string | null; address?: unknown } | null;
  origin: string;
  /// The incoming request's headers, for the one analytics event that means
  /// revenue. Required rather than optional so a third caller can't quietly
  /// arrive without it and leave the last step of the funnel reading zero.
  headers: Headers;
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
      //
      // A null `expiresAt` is not "already over" — it means the journey predates
      // billing and never ends (`session.ts`, `hasExpired`). Writing a date onto
      // it would make paying for more time the one action that takes it away, so
      // the extension is recorded and the journey keeps its unlimited window.
      // Checkout refuses these before any money moves; this is the backstop for
      // a purchase that was already in flight.
      if (ws.expiresAt === null) {
        // Still stop charging them for the consultant, even in the one case
        // where the time they bought does nothing. They paid.
        if (ws.isTrial) await tx.workspace.update({ where: { id: ws.id }, data: { isTrial: false } });
        await tx.purchase.update({
          where: { id: purchase.id },
          data: { status: "redeemed", paidAt: now, redeemedAt: now, stripeSessionId, ...shipping },
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
        data: {
          expiresAt: resolveExpiry(purchase, base),
          // The moment anybody's money reaches this journey it stops being a
          // trial — the consultant stops costing either parent a free turn,
          // and the shower card and the keepsake open. One write, in the same
          // transaction as the window it comes with, so a journey can never be
          // paid for and still charging for turns.
          //
          // Note *either* parent. The window is a fact about the workspace, so
          // one person paying has always covered both seats; this makes the
          // turns behave the same way, which is what the wall promises out
          // loud: "whenever either of you continues, it opens for both".
          isTrial: false,
        },
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
  // Deliberately silent. `already` is a Stripe retry of a webhook we've
  // handled, and Stripe retries a lot — counting it would inflate the only
  // number in the funnel that means money, in proportion to how flaky the
  // network was rather than to how much was sold. The transaction above is
  // what makes this the state *transition* rather than a state.
  if (outcome.state === "already") return { ok: true, state: "already" };

  // The one event that means revenue. It fires for a first-time fulfillment
  // and nothing else — both here and in the `granted` case below.
  const sold = (state: "granted" | "extended") =>
    trackFunnel(
      FUNNEL.purchaseFulfilled,
      {
        state,
        tier: outcome.purchase.tier,
        kind: outcome.purchase.kind,
        amountCents: outcome.purchase.amountCents,
      },
      args.headers,
    );

  if (outcome.state === "extended") {
    await sold("extended");
    return { ok: true, state: "extended", purchaseId: outcome.purchase.id };
  }
  await sold("granted");

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

/* -------------------------------------------------------------- redeeming */

export type RedeemPurchaseResult =
  | { ok: true; workspaceId: string; inviteToken: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "unpaid" | "spent" | "needs-details" | "malformed" | "not-yours" };

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
  if (purchase.status !== "paid") return { ok: false, reason: "unpaid" };
  if (boughtForSomeoneElse(purchase, owner.email)) return { ok: false, reason: "not-yours" };

  const source = details ?? (purchase.draft ? JSON.parse(purchase.draft) : null);
  if (!source) return { ok: false, reason: "needs-details" };

  const parsed = journeyDraft.safeParse(source);
  if (!parsed.success) return { ok: false, reason: "malformed" };

  const expiresAt = resolveExpiry(purchase, new Date(), parseDueDate(parsed.data.dueDate));

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
        // A comp is not a trial. It grants the whole product, deliberately —
        // that is the point of `/admin/codes`, and the seeding experiment
        // depends on those people meeting the real Extend button rather than
        // a turn counter.
        isTrial: purchase.tier === TRIAL.id,
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
