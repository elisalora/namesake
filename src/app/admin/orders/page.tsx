import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { formatPrice } from "@/lib/pricing";
import MarkFulfilled from "@/components/MarkFulfilled";

// What needs to go in a box.
//
// Deliberately a list rather than an integration: no supplier is chosen yet,
// and guessing one would mean building against invented SKUs and webhooks.
// This is enough to fulfil by hand or hand off to a dropshipper, and it's the
// thing a real integration would replace.
export default async function OrdersPage(props: {
  searchParams: Promise<{ show?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { show } = await props.searchParams;
  const showAll = show === "all";

  const orders = await db.purchase.findMany({
    where: {
      needsShipping: true,
      status: { in: ["paid", "redeemed"] },
      ...(showAll ? {} : { fulfilledAt: null }),
    },
    orderBy: { paidAt: "asc" },
    include: {
      items: true,
      workspace: {
        include: {
          names: {
            where: { role: "first", chosenSlot: { not: null } },
            orderBy: { chosenSlot: "asc" },
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Orders to pack</h1>
        <a
          href={showAll ? "/admin/orders" : "/admin/orders?show=all"}
          className="text-sm font-semibold text-ink-soft hover:text-sage-deep"
        >
          {showAll ? "Show only outstanding" : "Show fulfilled too"}
        </a>
      </header>

      {orders.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-line bg-card p-8 text-center text-ink-soft">
          Nothing waiting to ship.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => {
            const address = parseAddress(order.shippingAddress);
            const chosenName = order.workspace?.names.map((n) => n.firstName).join(" & ") || null;
            // Twins: an engraved keepsake can't be made until both names are
            // settled, so what's being waited on is the whole decision, not
            // the first name to arrive.
            const waitingOnName =
              order.items.some((i) => i.shipsAfterNaming) && order.workspace?.status !== "decided";

            return (
              <li
                key={order.id}
                className={`rounded-2xl border bg-card p-6 ${
                  order.fulfilledAt ? "border-line opacity-60" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <span className="font-display text-xl text-ink">{order.tier}</span>
                    <span className="ml-3 text-sm text-ink-soft">
                      {order.paidAt?.toISOString().slice(0, 10)} ·{" "}
                      {formatPrice(order.amountCents, order.currency)}
                    </span>
                  </div>
                  <span className="flex items-center gap-3">
                    {order.kind !== "extend" && (
                      <Link
                        href={`/admin/orders/${order.id}/card`}
                        className="text-sm font-semibold text-sage-deep hover:text-pewter"
                      >
                        Print the card →
                      </Link>
                    )}
                    {order.fulfilledAt ? (
                      <span className="text-sm text-ink-soft">
                        Shipped {order.fulfilledAt.toISOString().slice(0, 10)}
                      </span>
                    ) : (
                      <MarkFulfilled purchaseId={order.id} />
                    )}
                  </span>
                </div>

                {waitingOnName && (
                  <p className="mt-3 rounded-xl border border-dashed border-line bg-paper px-4 py-2 text-sm text-ink-soft">
                    Includes a keepsake that needs the name — they haven&apos;t chosen yet.
                  </p>
                )}
                {chosenName && (
                  <p className="mt-3 text-sm text-ink-soft">
                    Name chosen: <span className="font-semibold text-ink">{chosenName}</span>
                  </p>
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Pack
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {order.items
                        .filter((i) => i.physical)
                        .map((i) => (
                          <li key={i.id} className="text-sm text-ink">
                            {i.quantity > 1 ? `${i.quantity} × ` : ""}
                            {i.name}
                            {i.shipsAfterNaming && (
                              <span className="ml-2 text-xs text-ink-soft">after naming</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Ship to
                    </div>
                    {address ? (
                      <address className="mt-1 whitespace-pre-line text-sm not-italic text-ink">
                        {[
                          order.shippingName,
                          address.line1,
                          address.line2,
                          [address.city, address.state, address.postal_code]
                            .filter(Boolean)
                            .join(" "),
                          address.country,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      </address>
                    ) : (
                      <p className="mt-1 text-sm text-sage-deep">
                        No address captured — check the Stripe session.
                      </p>
                    )}
                  </div>
                </div>

                <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
                  Bought by {order.purchaserName ?? "—"} ({order.purchaserEmail})
                  {order.recipientEmail ? ` · for ${order.recipientEmail}` : " · no recipient email"}
                  {order.giftMessage ? ` · card reads: “${order.giftMessage}”` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

function parseAddress(raw: string | null): Address | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Address;
  } catch {
    return null;
  }
}
