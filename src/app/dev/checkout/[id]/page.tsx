import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { paymentsAreSimulated } from "@/lib/purchase";
import { formatPrice } from "@/lib/pricing";
import SimulatePaymentButton from "@/components/SimulatePaymentButton";

// Development stand-in for Stripe Checkout. Only reachable while payments are
// simulated; with a real key set, this 404s.
export default async function DevCheckoutPage(props: { params: Promise<{ id: string }> }) {
  if (!paymentsAreSimulated()) notFound();

  const { id } = await props.params;
  const purchase = await db.purchase.findUnique({ where: { id }, include: { items: true } });
  if (!purchase) notFound();

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

        <ul className="mt-5 space-y-2">
          {purchase.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3">
              <span className="text-ink">
                {item.name}
                {item.physical && (
                  <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">ships</span>
                )}
              </span>
              <span className="text-ink-soft">
                {formatPrice(item.amountCents, purchase.currency)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-sm text-ink-soft">
            {purchase.recipientEmail ? `Gift for ${purchase.recipientEmail}` : "Total"}
          </span>
          <span className="font-display text-2xl text-plum">
            {formatPrice(purchase.amountCents, purchase.currency)}
          </span>
        </div>

        {purchase.needsShipping && (
          <p className="mt-3 rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Stripe would collect a shipping address here. Simulating uses a placeholder one so the
            orders view has something to render.
          </p>
        )}

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
