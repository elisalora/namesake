import Stripe from "stripe";

// Namesake — Stripe access.
//
// Same shape as the consultant and the mailer: with no key configured the app
// stays fully walkable, routing "checkout" to a local page that can simulate a
// successful payment. The fulfillment path is identical either way, so what you
// exercise in development is the code that runs in production.

export function stripeIsLive() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;

/// The Stripe client, or null when no key is configured.
export function getStripe() {
  if (!stripeIsLive()) return null;
  cached ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return cached;
}

/// Stripe rejects a webhook we can't verify. Missing the signing secret is a
/// misconfiguration, not a reason to trust the payload.
export function webhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}
