// Namesake — the product catalog.
//
// Two audiences, and the catalog is shaped around that: the gifter buys, the
// couple uses. Gift tiers are anchored on The Gift, which is the one designed
// to be handed over at a shower.
//
// Nothing here ships. Everything physical was withdrawn once it was clear the
// only person who could make it was the founder — see `ADD_ONS_FOR_SALE`.
//
// Everything is a one-time payment. Naming ends, so nothing auto-renews.
// Prices are inline rather than Stripe Price objects — no dashboard state to
// drift out of sync with this file — and each is env-overridable.

import { TRIAL_MONTHS } from "@/lib/trial";

export type TierId = "sprout" | "the_gift" | "whole_journey" | "self_serve";
export type AddOnId = "blanket" | "framed_print" | "keepsake_set";

/// How long a purchase grants.
///
/// `due_date_grace` can't be resolved when it's bought — a gifter rarely knows
/// the due date — so it's worked out at redemption, from the date the couple
/// enters. `fallbackMonths` covers a couple who'd rather not say.
export type AccessWindow =
  | { rule: "months"; months: number }
  | { rule: "due_date_grace"; graceDays: number; fallbackMonths: number };

export type Tier = {
  id: TierId;
  /// How it's redeemed: a gift is claimed by whoever holds the code, which for
  /// the boxed tiers is whoever the box was handed to.
  kind: "gift" | "journey";
  name: string;
  tagline: string;
  blurb: string;
  amountCents: number;
  currency: string;
  window: AccessWindow;
  /// Boxed tiers ship, so checkout has to collect an address.
  physical: boolean;
  boxContents?: string[];
  /// The anchor everything else is read against.
  featured?: boolean;
};

export type AddOn = {
  id: AddOnId;
  name: string;
  blurb: string;
  amountCents: number;
  physical: boolean;
  /// Some keepsakes can only be made once there's a name to put on them.
  shipsAfterNaming?: boolean;
};

function cents(envVar: string, fallback: number) {
  const raw = process.env[envVar];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const TIERS: Record<TierId, Tier> = {
  sprout: {
    id: "sprout",
    kind: "gift",
    name: "Sprout",
    tagline: "A month to choose",
    blurb:
      "The whole thing, for a month — priced so it's an easy yes, and so several of you can go in on it.",
    amountCents: cents("NAMESAKE_PRICE_SPROUT_CENTS", 1000),
    currency: "usd",
    window: { rule: "months", months: 1 },
    physical: false,
  },
  // COPY PLACEHOLDER — Marzipan owns name/tagline/blurb. Replace, don't work
  // around. The structure is settled: featured, three months, nothing ships.
  //
  // Deliberately says nothing about a printable card. The card exists, but only
  // behind `/admin/orders/[id]/card` — until a buyer can reach it, promising it
  // on the storefront is selling something we don't hand over.
  the_gift: {
    id: "the_gift",
    kind: "gift",
    name: "The Gift",
    tagline: "Three months to choose",
    blurb:
      "The whole thing for three months — long enough to change their minds twice — sent to them with your note on it.",
    amountCents: cents("NAMESAKE_PRICE_GIFT_CENTS", 3900),
    currency: "usd",
    window: { rule: "months", months: 3 },
    physical: false,
    featured: true,
  },
  whole_journey: {
    id: "whole_journey",
    kind: "gift",
    name: "The Whole Journey",
    tagline: "Until the baby arrives",
    blurb:
      "Everything, lasting the rest of the pregnancy and a week past the due date — because babies keep their own schedules.",
    // $59 against The Gift's $39. The ladder used to invert here — the
    // featured tier cost more and lasted less, so a gifter comparing the two
    // side by side was argued down it.
    amountCents: cents("NAMESAKE_PRICE_WHOLE_JOURNEY_CENTS", 5900),
    currency: "usd",
    // Resolved when they redeem and tell us the due date; nine months if they
    // would rather not say.
    window: { rule: "due_date_grace", graceDays: 7, fallbackMonths: 9 },
    physical: false,
  },
  self_serve: {
    id: "self_serve",
    kind: "journey",
    name: "A journey of your own",
    tagline: "For the two of you",
    blurb:
      "Three months with the consultant, your shortlist, ideas from the people you love, and the keepsake at the end.",
    amountCents: cents("NAMESAKE_PRICE_SELF_SERVE_CENTS", 2000),
    currency: "usd",
    window: { rule: "months", months: 3 },
    physical: false,
  },
};

/// What a trial journey costs and how long it runs. Not in `TIERS`, and not on
/// the storefront: nothing here is for sale, and a $0 row in a price list is a
/// thing to explain rather than a thing to buy. It exists as a grant because
/// that is how every journey in this product comes into being — see
/// `createTrialGrant` in lib/purchase.ts.
export const TRIAL = {
  id: "trial" as const,
  name: "Namesake, to try",
  months: TRIAL_MONTHS,
  amountCents: 0,
  currency: "usd",
};

/// Turning a trial into the real thing. Same money and the same window as
/// buying `self_serve` outright, because it *is* buying self_serve — the only
/// difference is that the journey already exists, so this extends the one
/// they're standing in rather than creating a second one.
///
/// Deliberately reads its price from the same env var as the tier it matches.
/// Two prices for one thing is how a storefront ends up disagreeing with a
/// paywall, and the paywall is the one nobody reviews.
export const UPGRADE = {
  id: "upgrade" as const,
  get name() {
    return `Continue with ${TIERS.self_serve.name}`;
  },
  get amountCents() {
    return TIERS.self_serve.amountCents;
  },
  get window() {
    return TIERS.self_serve.window;
  },
  currency: "usd",
};

/// Sold at the moment it's needed: you're past your due date and still talking
/// about it. Repeatable, and it extends from the current end date rather than
/// from today, so buying early never costs anyone time.
export const EXTEND = {
  id: "extend" as const,
  name: "One week past due?",
  blurb: "Another month, with everything exactly as you left it.",
  amountCents: cents("NAMESAKE_PRICE_EXTEND_CENTS", 1900),
  currency: "usd",
  window: { rule: "months", months: 1 } satisfies AccessWindow,
};

/// The catalog of record, not the shelf. None of these are on sale — see
/// `ADD_ONS_FOR_SALE` — but past orders still have to resolve their names and
/// prices, and the packing list still has to read.
export const ADD_ONS: Record<AddOnId, AddOn> = {
  blanket: {
    id: "blanket",
    name: "Embroidered blanket",
    blurb: "Soft cotton, embroidered with the name they choose.",
    amountCents: cents("NAMESAKE_PRICE_BLANKET_CENTS", 7500),
    physical: true,
    shipsAfterNaming: true,
  },
  framed_print: {
    id: "framed_print",
    name: "Framed keepsake",
    blurb: "The name and the story behind it, printed and framed.",
    amountCents: cents("NAMESAKE_PRICE_FRAMED_PRINT_CENTS", 3000),
    physical: true,
    shipsAfterNaming: true,
  },
  keepsake_set: {
    id: "keepsake_set",
    name: "The keepsake set",
    blurb: "The embroidered blanket and the framed print — both, together.",
    amountCents: cents("NAMESAKE_PRICE_KEEPSAKE_SET_CENTS", 9500),
    physical: true,
    shipsAfterNaming: true,
  },
};

export const GIFT_TIERS: Tier[] = [TIERS.sprout, TIERS.the_gift, TIERS.whole_journey];

/// Which add-ons can actually be bought right now — the single gate every
/// storefront and every checkout route reads.
///
/// Empty, and deliberately so: all three are made and posted by hand, by one
/// person, and every sale is an obligation she'd have to work off herself.
/// `ADD_ONS` stays as the catalog of record so historical orders still resolve
/// and so this is one line to reverse the day somebody else can make them.
export const ADD_ONS_FOR_SALE: AddOnId[] = [];

export function isTierId(value: string): value is TierId {
  return value in TIERS;
}

/// Deliberately narrower than "is a known add-on". Nothing may be bought that
/// isn't on sale, whichever route the request arrives on.
export function isAddOnForSale(value: string): value is AddOnId {
  return (ADD_ONS_FOR_SALE as string[]).includes(value);
}

export function formatPrice(amountCents: number, currency = "usd") {
  const amount = amountCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/// Describes a window in words, for the storefront.
export function describeWindow(window: AccessWindow) {
  if (window.rule === "months") {
    return window.months === 1 ? "1 month" : `${window.months} months`;
  }
  return "Until the due date, plus a week";
}
