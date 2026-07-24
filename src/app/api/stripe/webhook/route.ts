import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, webhookSecret } from "@/lib/stripe";
import { originFrom } from "@/lib/auth";
import { fulfillPurchase } from "@/lib/purchase";

// Stripe tells us a payment succeeded. This is the only path that grants
// access in production — the success_url is just where the browser lands, and
// a browser can be closed, refreshed, or forged.
//
// Fulfillment is idempotent because Stripe retries: it re-sends an event until
// it gets a 2xx, so the same session can arrive several times.
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = webhookSecret();

  if (!stripe || !secret) {
    // Nothing signed it and nothing can verify it — refuse rather than trust.
    console.error("[namesake] stripe webhook hit without STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  // Must be the raw body — a parsed-and-restringified payload won't verify.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    console.error("[namesake] stripe signature verification failed", err);
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge everything else so Stripe stops retrying it.
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const purchaseId = session.metadata?.purchaseId ?? session.client_reference_id;
  if (!purchaseId) {
    console.error("[namesake] checkout session with no purchaseId", session.id);
    return NextResponse.json({ received: true });
  }

  // Boxed tiers and add-ons collect an address at Checkout; this is where it
  // reaches us. `collected_information` is where Stripe puts it now — the
  // older top-level `shipping_details` is kept as a fallback.
  const collected = (
    session as Stripe.Checkout.Session & {
      collected_information?: { shipping_details?: { name?: string | null; address?: unknown } };
      shipping_details?: { name?: string | null; address?: unknown };
    }
  );
  const shippingDetails = collected.collected_information?.shipping_details ?? collected.shipping_details;

  const result = await fulfillPurchase({
    purchaseId,
    stripeSessionId: session.id,
    shipping: shippingDetails
      ? { name: shippingDetails.name ?? null, address: shippingDetails.address }
      : null,
    origin: originFrom(request),
  });

  if (!result.ok) {
    // A 500 makes Stripe retry. That's right for a transient fault, but a
    // purchase we can't find will never appear, so don't spin on it.
    console.error(`[namesake] could not fulfill ${purchaseId}: ${result.reason}`);
    return NextResponse.json({ received: true, unfulfilled: result.reason });
  }

  return NextResponse.json({ received: true, state: result.state });
}
