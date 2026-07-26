import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// The way in.
//
// /admin/codes and /admin/orders both existed before this page did, which meant
// the obvious URL — the one you'd type from memory — was the only one that 404'd,
// and it did so identically whether you weren't an admin or the route simply
// wasn't there. A landing page costs almost nothing and removes that question.
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();

  // Just enough to say whether either page is worth opening right now.
  const [unusedCodes, ordersToPack] = await Promise.all([
    db.purchase.count({ where: { tier: "comp", status: "paid" } }),
    db.purchase.count({
      where: { needsShipping: true, status: { in: ["paid", "redeemed"] }, fulfilledAt: null },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Admin</h1>
        <Link href="/journeys" className="text-sm font-semibold text-ink-soft hover:text-sage-deep">
          Your journeys →
        </Link>
      </header>
      <p className="mt-2 text-sm text-ink-soft">
        Signed in as <span className="font-semibold text-ink">{admin.email}</span>.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card
          href="/admin/codes"
          title="Free codes"
          blurb="Give the whole experience away — to a friend, a tester, or someone you love. No card, no checkout."
          note={
            unusedCodes === 0
              ? "No unused codes right now"
              : `${unusedCodes} code${unusedCodes === 1 ? "" : "s"} made and not yet opened`
          }
        />
        <Card
          href="/admin/orders"
          title="Orders to pack"
          blurb="Boxed tiers and keepsake add-ons that someone has paid for and is waiting on."
          note={
            ordersToPack === 0
              ? "Nothing waiting to ship"
              : `${ordersToPack} order${ordersToPack === 1 ? "" : "s"} waiting`
          }
        />
      </div>
    </main>
  );
}

function Card({
  href,
  title,
  blurb,
  note,
}: {
  href: string;
  title: string;
  blurb: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-line bg-card p-6 transition hover:border-sage hover:shadow-[0_18px_40px_-28px_rgba(65,74,69,0.5)]"
    >
      <div className="font-display text-xl text-pewter">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{blurb}</p>
      <div className="mt-3 text-xs font-semibold text-sage-deep">{note}</div>
    </Link>
  );
}
