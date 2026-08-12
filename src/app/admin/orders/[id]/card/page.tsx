import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { qrSvg } from "@/lib/qr";
import { TIERS, describeWindow, type TierId } from "@/lib/pricing";
import DuckMark from "@/components/DuckMark";
import PrintButton from "@/components/PrintButton";

// The card that goes in the box.
//
// Printed at packing time, so it has to work before the journey exists: the QR
// points at the redeem link, which is the only thing that does exist yet. The
// code is printed underneath as well, because a QR that won't scan in dim
// light at a shower is otherwise a dead end.
export default async function GiftCardPage(props: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const { id } = await props.params;
  const purchase = await db.purchase.findUnique({ where: { id } });
  if (!purchase || purchase.kind === "extend") notFound();

  const h = await headers();
  const configured = process.env.NAMESAKE_URL?.trim().replace(/\/+$/, "");
  const origin =
    configured || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const redeemUrl = `${origin}/redeem/${purchase.redeemCode}`;
  const tier = TIERS[purchase.tier as TierId];
  const shortUrl = redeemUrl.replace(/^https?:\/\//, "");

  // The suggestion slug is reserved at purchase, so this card can be printed
  // now even though the journey it points at doesn't exist yet. Anyone who
  // scans early is told to come back rather than shown a dead link.
  const suggestUrl = purchase.suggestSlug ? `${origin}/s/${purchase.suggestSlug}` : null;

  const [qr, showerQr] = await Promise.all([
    qrSvg(redeemUrl),
    suggestUrl ? qrSvg(suggestUrl) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between print:hidden">
        <Link href="/admin/orders" className="text-sm text-ink-soft hover:text-sage-deep">
          ← Back to orders
        </Link>
        <PrintButton />
      </header>

      <div className="print:hidden">
        <p className="engraved mt-8">Packing</p>
        <h1 className="mt-2 font-display text-4xl text-ink">The card for the box</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
          Print this and put it in {purchase.purchaserName ?? "the buyer"}&apos;s box. It carries
          their note and the link that opens the journey — the recipient scans it, signs in, and
          sets up their own room.
        </p>
        <dl className="mt-5 space-y-1 rounded-2xl border border-line bg-card p-5 text-sm">
          <Row label="Tier" value={tier?.name ?? purchase.tier} />
          <Row label="Lasts" value={tier ? describeWindow(tier.window) : "—"} />
          <Row label="Bought by" value={`${purchase.purchaserName ?? "—"} · ${purchase.purchaserEmail}`} />
          <Row label="For" value={purchase.recipientEmail ?? "no email — the card is the delivery"} />
          <Row label="Status" value={purchase.redeemedAt ? "already opened" : "not yet opened"} />
        </dl>
      </div>

      {/* The card itself. Everything above is hidden when printed. */}
      <section className="mt-10 break-inside-avoid">
        <div className="mx-auto max-w-md rounded-[1.5rem] border border-line bg-card px-10 py-12 text-center shadow-[0_28px_70px_-40px_rgba(65,74,69,0.45)] print:border-ink/20 print:shadow-none">
          <DuckMark className="mx-auto h-6 w-auto text-pewter-light" />
          <p className="engraved mt-4">A gift for you</p>

          {purchase.giftMessage ? (
            <blockquote className="mt-7 font-display text-2xl italic leading-relaxed text-ink">
              “{purchase.giftMessage}”
            </blockquote>
          ) : (
            <p className="mt-7 font-display text-2xl italic leading-relaxed text-ink">
              A name is the first thing you give them.
            </p>
          )}

          {purchase.purchaserName && (
            <p className="mt-5 text-sm text-ink-soft">— {purchase.purchaserName}</p>
          )}

          <div className="my-9 h-px bg-line" />

          <div
            className="mx-auto w-40 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />

          <p className="mt-6 text-sm leading-relaxed text-ink-soft">
            Scan to open your journey — {tier ? describeWindow(tier.window).toLowerCase() : ""} of
            choosing a name, together.
          </p>
          <p className="mt-3 break-all text-[11px] leading-relaxed text-pewter-light">{shortUrl}</p>
        </div>
      </section>

      {/* The second card: the one that goes on the gift table. */}
      {showerQr && (
        <section className="mt-12 break-before-page break-inside-avoid">
          <div className="mb-2 engraved print:hidden">The shower card</div>
          <div className="mx-auto max-w-md rounded-[1.5rem] border border-line bg-card px-10 py-12 text-center shadow-[0_28px_70px_-40px_rgba(65,74,69,0.45)] print:border-ink/20 print:shadow-none">
            <p className="engraved">Help us choose</p>
            <p className="mt-4 font-display text-3xl leading-snug text-ink">
              Leave us a name you love
            </p>
            <div
              className="mx-auto mt-7 w-40 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: showerQr }}
            />
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              Scan and tell us the name — and the story behind it. That&apos;s the part
              we&apos;ll keep.
            </p>
            <p className="mt-3 break-all text-[11px] leading-relaxed text-pewter-light">
              {suggestUrl?.replace(/^https?:\/\//, "")}
            </p>
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-soft print:hidden">
        Print at actual size — two cards, one per page. The shower card works from the moment
        they open their gift; anyone who scans it before then is told to come back.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
