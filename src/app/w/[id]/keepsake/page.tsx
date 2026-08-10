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
      names: { where: { chosenSlot: { not: null } }, orderBy: { chosenSlot: "asc" } },
      suggestions: true,
    },
  });

  const givenNames = ws?.names.filter((n) => n.role !== "middle") ?? [];

  // The other thing a trial doesn't include.
  //
  // This page has no session check by design — a keepsake you can't send to a
  // grandparent isn't a keepsake — so the gate is on the journey rather than
  // on the reader, and it lifts for everyone the moment anybody pays. Checked
  // before the "not ready yet" branch below, because a trial that hasn't
  // chosen a name should hear the true reason rather than a nearly-true one.
  if (ws?.isTrial) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12 text-center">
        <div className="font-display text-3xl text-pewter">The keepsake comes with the full journey</div>
        <p className="mt-3 leading-relaxed text-ink-soft">
          The name, the story of why, and the day it was chosen — printed, for the baby book.
          It&apos;s waiting at the end of {ws.babyLabel}&apos;s journey once it&apos;s continued.
        </p>
        <Link
          href={`/w/${id}`}
          className="mt-6 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
        >
          Back to {ws.babyLabel}
        </Link>
      </main>
    );
  }

  if (!ws || ws.status !== "decided" || givenNames.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-ink-soft">
        <p>
          This keepsake isn&apos;t ready yet — {ws && ws.babyCount > 1 ? "they don't all have names" : "a name hasn't been chosen"}.
        </p>
        <Link href={`/w/${id}`} className="rounded-full bg-sage-deep px-5 py-2.5 text-white">
          Back to the journey
        </Link>
      </main>
    );
  }

  // One entry per baby, in the order they were named. For a single baby this
  // renders exactly as it always did.
  const middleFor = new Map(
    ws.names.filter((n) => n.role === "middle").map((n) => [n.chosenSlot!, n.firstName]),
  );
  const chosen = givenNames.map((n) => ({
    ...n,
    full: [n.firstName, middleFor.get(n.chosenSlot!) ?? n.middleName, n.lastName ?? ws.lastName]
      .filter(Boolean)
      .join(" "),
  }));
  const many = chosen.length > 1;
  // The keepsake is the thing they keep. "& Partner" printed on it forever
  // would be the worst place for a placeholder to survive.
  const parentLine = buildParentLine(ws.members);
  const contributors = Array.from(new Set(ws.suggestions.map((s) => s.suggesterName).filter(Boolean)));
  // The day the naming was finished, from the names themselves. With twins
  // that's the later of the two — one name is a milestone, both is the day
  // this certificate became true.
  //
  // Not ws.updatedAt: that means "when this row was last touched", and every
  // consultant message touches it, so a couple who came back in May to talk
  // about a middle name printed a keepsake dating their daughter to May.
  // Null for names chosen before chosenAt existed, and the line is dropped
  // rather than guessed — this gets printed and kept.
  const chosenAt = chosen
    .map((n) => n.chosenAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const decidedOn = chosenAt?.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          <div className="font-display text-sm uppercase tracking-[0.3em] text-gold">
            {many ? "Names chosen with love" : "A name chosen with love"}
          </div>

          <div className="mt-8 text-ink-soft">
            We are so happy to share the {many ? "names of" : "name of"}
          </div>
          {chosen.map((n, i) => (
            <h1
              key={n.id}
              className={`font-display leading-tight text-pewter ${
                many ? "mt-3 text-4xl sm:text-5xl" : "mt-3 text-5xl sm:text-6xl"
              }`}
            >
              {n.full}
              {many && i < chosen.length - 1 && (
                <span className="mx-3 align-middle text-2xl text-gold">&amp;</span>
              )}
            </h1>
          ))}

          <div className="mx-auto my-8 flex items-center justify-center gap-3 text-gold">
            <span className="h-px w-12 bg-gold/40" />
            <span>✦</span>
            <span className="h-px w-12 bg-gold/40" />
          </div>

          {/* Each name keeps its own story — with twins there are two, and
              flattening them into one would lose the half that belongs to the
              other child. */}
          {chosen.some((n) => n.chosenReason) && (
            <div className="mx-auto max-w-lg space-y-5">
              <div className="font-display text-sm uppercase tracking-widest text-ink-soft">
                {many ? "Why we chose them" : "Why we chose it"}
              </div>
              {chosen
                .filter((n) => n.chosenReason)
                .map((n) => (
                  <div key={n.id}>
                    {many && (
                      <div className="font-display text-base text-pewter">{n.firstName}</div>
                    )}
                    <p className="mt-1 font-display text-lg italic leading-relaxed text-ink">
                      “{n.chosenReason}”
                    </p>
                  </div>
                ))}
            </div>
          )}

          {chosen.some((n) => n.meaning) && (
            <div className="mt-6 space-y-1">
              {chosen
                .filter((n) => n.meaning)
                .map((n) => (
                  <p key={n.id} className="text-sm text-ink-soft">
                    <span className="font-semibold text-pewter">{n.firstName}</span>
                    {n.origin ? ` · ${n.origin}` : ""} — {n.meaning}
                  </p>
                ))}
            </div>
          )}

          {contributors.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="text-xs uppercase tracking-widest text-ink-soft">With ideas & love from</div>
              <p className="mt-2 text-ink">{contributors.join(" · ")}</p>
            </div>
          )}

          <div className="mt-10 text-ink-soft">
            <div className="font-display text-xl text-pewter">{parentLine}</div>
            {decidedOn && <div className="mt-1 text-sm">chosen {decidedOn}</div>}
          </div>
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-ink-soft print:hidden">
        Tip: “Save as PDF” to keep this for the baby book — or print it to frame. · Namesake
      </p>
    </main>
  );
}
