import { NextResponse } from "next/server";
import { z } from "zod";
import { originFrom } from "@/lib/auth";
import { fulfillPurchase, paymentsAreSimulated } from "@/lib/purchase";

// Development only: stand in for the Stripe webhook so the billing flow can be
// walked with no Stripe account. It calls exactly the same fulfillment function
// the real webhook does, so this exercises the production path rather than a
// parallel one.
//
// The guard is the point — the moment STRIPE_SECRET_KEY is set, or the build is
// a production one, this route grants nothing.
export async function POST(request: Request) {
  if (!paymentsAreSimulated()) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const parsed = z
    .object({ purchaseId: z.string().min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Which purchase?" }, { status: 400 });
  }

  const result = await fulfillPurchase({
    purchaseId: parsed.data.purchaseId,
    stripeSessionId: `sim_${parsed.data.purchaseId}`,
    origin: originFrom(request),
  });

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  return NextResponse.json({
    ok: true,
    state: result.state,
    redeemUrl: result.state === "granted" ? result.redeemUrl : undefined,
  });
}
