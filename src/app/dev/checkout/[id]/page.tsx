import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { paymentsAreSimulated } from "@/lib/purchase";
import { PLANS, formatPrice, type PlanKind } from "@/lib/pricing";
import SimulatePaymentButton from "@/components/SimulatePaymentButton";

// Development stand-in for Stripe Checkout. Only reachable while payments are
// simulated; with a real key set, this 404s.
export default async function DevCheckoutPage(props: { params: Promise<{ id: string }> }) {
  if (!paymentsAreSimulated()) notFound();

  const { id } = await props.params;
  const purchase = await db.purchase.findUnique({ where: { id } });
  if (!purchase) notFound();

  const plan = PLANS[purchase.kind as PlanKind];
  const alreadyDone = purchase.status !== "pending";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
      <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-plum">
        Namesake
      </Link>

      <div className="animate-rise mt-6 rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
        <div className="rounded-xl border border-dashed border-line bg-paper px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Dev mode · no Stripe key configured
        </div>

        <h1 className="mt-5 font-display text-3xl text-ink">{plan.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{plan.description}</p>

        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
          <span className="text-sm text-ink-soft">
            {plan.months} months
            {purchase.recipientEmail ? ` · gift for ${purchase.recipientEmail}` : ""}
          </span>
          <span className="font-display text-2xl text-plum">{formatPrice(plan)}</span>
        </div>

        <div className="mt-6">
          {alreadyDone ? (
            <p className="text-sm text-ink-soft">
              This one has already been paid.{" "}
              {purchase.kind === "extend" ? (
                <Link
                  href={`/w/${purchase.workspaceId}`}
                  className="font-semibold text-rose-deep hover:text-plum"
                >
                  Back to the journey →
                </Link>
              ) : (
                <Link
                  href={`/redeem/${purchase.redeemCode}`}
                  className="font-semibold text-rose-deep hover:text-plum"
                >
                  Open it →
                </Link>
              )}
            </p>
          ) : (
            <SimulatePaymentButton
              purchaseId={purchase.id}
              fallbackHref={
                purchase.kind === "extend"
                  ? `/w/${purchase.workspaceId}?extended=1`
                  : `/redeem/${purchase.redeemCode}`
              }
            />
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-ink-soft">
          This runs the same fulfillment code the Stripe webhook calls. Set{" "}
          <code className="rounded bg-paper px-1">STRIPE_SECRET_KEY</code> and this page stops
          existing.
        </p>
      </div>
    </main>
  );
}
