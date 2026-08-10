import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMemberForWorkspace } from "@/lib/session";
import { qrSvg } from "@/lib/qr";
import PrintButton from "@/components/PrintButton";

// The shower QR.
//
// A card on the gift table that lets everyone at the shower put a name forward
// — which spares the couple a day of unsolicited opinions, and quietly shows
// fifteen to thirty people what Namesake is. It points at the suggestion link
// that already exists; this page is what makes it printable.
export default async function ShowerPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const member = await getMemberForWorkspace(id);
  if (!member) notFound();

  const ws = await db.workspace.findUnique({ where: { id } });
  if (!ws) notFound();

  // One of the two things a trial doesn't include. The link into here is
  // already replaced with an explanation, so reaching this is either a typed
  // URL or a bookmark from before — but the gate has to live at the page, not
  // at the link, or it isn't a gate.
  if (ws.isTrial) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12 text-center">
        <div className="font-display text-3xl text-pewter">The shower card comes with the full journey</div>
        <p className="mt-3 leading-relaxed text-ink-soft">
          A printable card and a sign for the gift table, so the whole room can put a name forward
          — it&apos;s part of {ws.babyLabel}&apos;s journey once you continue. Everything you&apos;ve
          already written stays exactly where it is either way.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/w/${id}`}
            className="rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
          >
            Back to {ws.babyLabel}
          </Link>
        </div>
      </main>
    );
  }

  const h = await headers();
  const configured = process.env.NAMESAKE_URL?.trim().replace(/\/+$/, "");
  const origin =
    configured || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const suggestUrl = `${origin}/s/${ws.suggestSlug}`;
  const [cardQr, signQr] = await Promise.all([qrSvg(suggestUrl), qrSvg(suggestUrl)]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between print:hidden">
        <Link href={`/w/${id}`} className="text-sm text-ink-soft hover:text-sage-deep">
          ← Back to {ws.babyLabel}
        </Link>
        <PrintButton />
      </header>

      <div className="print:hidden">
        <h1 className="mt-8 font-display text-4xl text-ink">Bring the room in</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
          Put this out at the shower. Anyone can scan it and leave a name for {ws.babyLabel} —
          along with why they chose it. Suggestions land in your shortlist for the two of you to
          look at later, together, with nobody watching your face.
        </p>
        <p className="mt-4 break-all rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          {suggestUrl}
        </p>
      </div>

      {/* The card — pocket-sized, for the gift table. */}
      <section className="mt-10 break-inside-avoid">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft print:hidden">
          The card
        </div>
        <div className="mx-auto max-w-sm rounded-3xl border border-line bg-card p-8 text-center shadow-[0_20px_60px_-30px_rgba(65,74,69,0.4)] print:border-ink/20 print:shadow-none">
          <div className="font-display text-xs uppercase tracking-[0.2em] text-sage-deep">
            Help us name
          </div>
          <div className="mt-2 font-display text-3xl leading-tight text-ink">{ws.babyLabel}</div>
          <div
            className="mx-auto mt-5 w-44 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <p className="mt-5 text-sm leading-relaxed text-ink-soft">
            Scan and leave a name you love — and tell us why. We&apos;ll read every one.
          </p>
        </div>
      </section>

      {/* The sign — readable from across a table. */}
      <section className="mt-12 break-before-page break-inside-avoid">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft print:hidden">
          The table sign
        </div>
        <div className="rounded-3xl border border-line bg-card p-12 text-center print:border-ink/20">
          <div className="font-display text-sm uppercase tracking-[0.2em] text-sage-deep">
            A name for
          </div>
          <div className="mt-3 font-display text-6xl leading-tight text-ink">{ws.babyLabel}</div>
          <div
            className="mx-auto mt-8 w-64 [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: signQr }}
          />
          <p className="mx-auto mt-8 max-w-md text-lg leading-relaxed text-ink-soft">
            Scan to suggest a name. Tell us the story behind it — that&apos;s the part
            they&apos;ll keep.
          </p>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-ink-soft print:hidden">
        Print at actual size. The card fits a standard gift-table frame; the sign is meant for
        a stand.
      </p>
    </main>
  );
}
