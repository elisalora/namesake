import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import CompCodes from "@/components/CompCodes";

// Free access codes to hand out for feedback or as a gift. A comp is a gift
// that's born already paid, so it never touches checkout.
export default async function CodesPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const rows = await db.purchase.findMany({
    where: { tier: "comp" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { workspace: { select: { babyLabel: true } } },
  });

  const codes = rows.map((p) => ({
    code: p.redeemCode,
    created: p.createdAt.toISOString(),
    redeemed: p.status === "redeemed",
    babyLabel: p.workspace?.babyLabel ?? null,
    fromName: p.purchaserName,
    message: p.giftMessage,
    recipientEmail: p.recipientEmail,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Free codes</h1>
        <Link href="/admin/orders" className="text-sm font-semibold text-ink-soft hover:text-sage-deep">
          Orders to pack →
        </Link>
      </header>
      <p className="mt-2 text-sm text-ink-soft">
        Gift the whole experience to friends and family — for feedback, or just because. No payment,
        no fake card numbers.
      </p>

      <div className="mt-8">
        <CompCodes codes={codes} />
      </div>
    </main>
  );
}
