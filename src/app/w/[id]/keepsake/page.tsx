import Link from "next/link";
import { db } from "@/lib/db";
import { parentLine as buildParentLine } from "@/lib/seat";
import PrintButton from "@/components/PrintButton";

export default async function KeepsakePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ws = await db.workspace.findUnique({
    where: { id },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      chosenName: { include: { comments: { orderBy: { createdAt: "asc" } } } },
      suggestions: true,
    },
  });

  if (!ws || ws.status !== "decided" || !ws.chosenName) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-ink-soft">
        <p>This keepsake isn&apos;t ready yet — a name hasn&apos;t been chosen.</p>
        <Link href={`/w/${id}`} className="rounded-full bg-sage-deep px-5 py-2.5 text-white">
          Back to the journey
        </Link>
      </main>
    );
  }

  const n = ws.chosenName;
  const full = [n.firstName, n.middleName, n.lastName ?? ws.lastName].filter(Boolean).join(" ");
  // The keepsake is the thing they keep. "& Partner" printed on it forever
  // would be the worst place for a placeholder to survive.
  const parentLine = buildParentLine(ws.members);
  const contributors = Array.from(new Set(ws.suggestions.map((s) => s.suggesterName).filter(Boolean)));
  const decidedOn = ws.updatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href={`/w/${id}`} className="text-sm text-ink-soft hover:text-pewter">
          ← Back to the journey
        </Link>
        <PrintButton />
      </div>

      <article className="relative overflow-hidden rounded-[28px] border-2 border-gold/40 bg-card p-10 text-center shadow-[0_30px_80px_-40px_rgba(65,74,69,0.5)] sm:p-14">
        <div className="pointer-events-none absolute inset-3 rounded-[22px] border border-gold/20" />
        <div className="relative">
          <div className="font-display text-sm uppercase tracking-[0.3em] text-gold">A name chosen with love</div>

          <div className="mt-8 text-ink-soft">We are so happy to share the name of</div>
          <h1 className="mt-3 font-display text-5xl leading-tight text-pewter sm:text-6xl">{full}</h1>

          <div className="mx-auto my-8 flex items-center justify-center gap-3 text-gold">
            <span className="h-px w-12 bg-gold/40" />
            <span>✦</span>
            <span className="h-px w-12 bg-gold/40" />
          </div>

          {ws.decidedReason && (
            <div className="mx-auto max-w-lg">
              <div className="font-display text-sm uppercase tracking-widest text-ink-soft">Why we chose it</div>
              <p className="mt-3 font-display text-lg italic leading-relaxed text-ink">“{ws.decidedReason}”</p>
            </div>
          )}

          {n.meaning && (
            <p className="mt-6 text-sm text-ink-soft">
              <span className="font-semibold text-pewter">{n.firstName}</span>
              {n.origin ? ` · ${n.origin}` : ""} — {n.meaning}
            </p>
          )}

          {contributors.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="text-xs uppercase tracking-widest text-ink-soft">With ideas & love from</div>
              <p className="mt-2 text-ink">{contributors.join(" · ")}</p>
            </div>
          )}

          <div className="mt-10 text-ink-soft">
            <div className="font-display text-xl text-pewter">{parentLine}</div>
            <div className="mt-1 text-sm">chosen {decidedOn}</div>
          </div>
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-ink-soft print:hidden">
        Tip: “Save as PDF” to keep this for the baby book — or print it to frame. · Namesake
      </p>
    </main>
  );
}
