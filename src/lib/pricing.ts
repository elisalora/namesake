// Namesake — what things cost.
//
// Prices are defined inline rather than as Stripe Price objects, so there's no
// dashboard setup to keep in sync with the code. Override the amounts with env
// vars if you want to change them without a deploy.

export type PlanKind = "journey" | "gift" | "extend";

export type Plan = {
  kind: PlanKind;
  months: number;
  amountCents: number;
  currency: string;
  name: string;
  description: string;
};

function cents(envVar: string, fallback: number) {
  const raw = process.env[envVar];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PLANS: Record<PlanKind, Plan> = {
  journey: {
    kind: "journey",
    months: 6,
    amountCents: cents("NAMESAKE_PRICE_JOURNEY_CENTS", 3900),
    currency: "usd",
    name: "Namesake · a naming journey",
    description:
      "Six months together: the consultant, your shortlist, ideas from family & friends, and a keepsake to keep.",
  },
  gift: {
    kind: "gift",
    months: 6,
    amountCents: cents("NAMESAKE_PRICE_GIFT_CENTS", 3900),
    currency: "usd",
    name: "Namesake · a naming journey (gift)",
    description:
      "Six months of Namesake for expecting parents you love — they'll set it up in their own words.",
  },
  extend: {
    kind: "extend",
    months: 3,
    amountCents: cents("NAMESAKE_PRICE_EXTEND_CENTS", 1500),
    currency: "usd",
    name: "Namesake · three more months",
    description: "More time to keep choosing, with everything exactly as you left it.",
  },
};

export function formatPrice(plan: Plan) {
  const amount = plan.amountCents / 100;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}
