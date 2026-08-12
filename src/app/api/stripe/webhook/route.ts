import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, webhookSecret } from "@/lib/stripe";
import { originFrom } from "@/lib/auth";
import {
  fulfillPurchase,
  refundPurchase,
  disputePurchase,
  resolveDispute,
} from "@/lib/purchase";

// Stripe tells us what happened to the money. This is the only path that grants
// access in production — the success_url is just where the browser lands, and
// a browser can be closed, refreshed, or forged.
//
// It is also the only path that takes access back. Refunds are issued in the
// Stripe dashboard, which the app never sees; without the charge events below,
// refunding gave the money back and changed nothing here — the redeem link kept
// working and a refunded box stayed on the packing list.
//
// Everything here is idempotent because Stripe retries: it re-sends an event
// until it gets a 2xx, so the same event can arrive several times.
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

  // The money coming back. Rare, and never initiated from inside the app —
  // which is exactly why it has to arrive this way.
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed"
  ) {
    return handleChargeEvent(event);
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
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    shipping: shippingDetails
      ? { name: shippingDetails.name ?? null, address: shippingDetails.address }
      : null,
    origin: originFrom(request),
    headers: request.headers,
  });

  if (!result.ok) {
    // A 500 makes Stripe retry. That's right for a transient fault, but a
    // purchase we can't find will never appear, so don't spin on it.
    console.error(`[namesake] could not fulfill ${purchaseId}: ${result.reason}`);
    return NextResponse.json({ received: true, unfulfilled: result.reason });
  }

  return NextResponse.json({ received: true, state: result.state });
}

/// Refunds and chargebacks.
///
/// None of these can be triggered from inside Namesake — a refund is issued in
/// the Stripe dashboard and a dispute is opened by a cardholder's bank — so the
/// webhook is the only place the app can learn about them.
///
/// Every branch answers 2xx, including the ones that change nothing. A charge
/// we can't match to a purchase is not going to become matchable on a retry,
/// and Stripe would re-send it for days.
async function handleChargeEvent(event: Stripe.Event) {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const result = await refundPurchase(charge);
    if (!result.ok) {
      // A partial refund is a real thing that buys nothing back — a shipping
      // adjustment, a goodwill discount — so it is a normal outcome, not a
      // fault. An unmatched charge is worth a line in the log.
      if (result.reason === "unknown-charge") {
        console.error("[namesake] refund for a charge we can't place:", charge.id);
      }
      return NextResponse.json({ received: true, refunded: false, reason: result.reason });
    }
    return NextResponse.json({ received: true, purchaseId: result.purchaseId, state: result.state });
  }

  const dispute = event.data.object as Stripe.Dispute;

  let result;
  if (event.type === "charge.dispute.created") {
    result = await disputePurchase(dispute);
  } else if (dispute.status === "lost") {
    // The bank took the money. Same end state as a refund, by a worse road.
    result = await resolveDispute(dispute, "lost");
  } else if (dispute.status === "won" || dispute.status === "warning_closed") {
    // We kept the money — either we won it back, or the inquiry closed without
    // ever becoming a chargeback. Both give the purchase back exactly as it was.
    result = await resolveDispute(dispute, "won");
  } else {
    // Closed into some other state. Don't guess which way the money went:
    // leave the hold on and let the next event say.
    console.warn(`[namesake] dispute ${dispute.id} closed as ${dispute.status} — left on hold`);
    return NextResponse.json({ received: true, state: "unchanged" });
  }

  if (!result.ok) {
    console.error("[namesake] dispute for a charge we can't place:", dispute.id, dispute.charge);
    return NextResponse.json({ received: true, reason: result.reason });
  }
  console.warn(
    `[namesake] dispute ${dispute.id} (${dispute.status}) — purchase ${result.purchaseId} is now ${result.state}`,
  );
  return NextResponse.json({ received: true, purchaseId: result.purchaseId, state: result.state });
}
