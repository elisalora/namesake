import Link from "next/link";
import { db } from "@/lib/db";
import { namedParents, parentLine as buildParentLine } from "@/lib/seat";
import { babiesLabel } from "@/lib/babies";
import { hasExpired } from "@/lib/session";
import SuggestForm from "@/components/SuggestForm";

export default async function SuggestPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ws = await db.workspace.findUnique({
    where: { suggestSlug: slug },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  if (!ws) {
    // The slug is reserved when a gift is bought, so a card can be printed and
    // boxed before the journey exists. Someone scanning it at a shower before
    // the couple has opened their gift should be told to come back, not shown
    // a dead end — the link will start working the moment they do.
    const reserved = await db.purchase.findUnique({
      where: { suggestSlug: slug },
      select: { id: true },
    });

    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        {reserved ? (
          <>
            <div className="mb-3 text-3xl">✦</div>
            <h1 className="font-display text-3xl text-pewter">Not quite yet</h1>
            <p className="mt-3 leading-relaxed text-ink-soft">
              This is the right link — the parents just haven&apos;t opened their gift yet. Try
              again once they have, and your suggestion will be waiting for them.
            </p>
          </>
        ) : (
          <p className="text-ink-soft">This suggestion link doesn&apos;t seem to exist.</p>
        )}
      </main>
    );
  }

  // Only people who've actually been named — an unclaimed seat would put
  // "& Partner" in front of everyone the couple invited.
  const parentLine = buildParentLine(ws.members, "the parents");
  // "Mia have already found" needs a singular verb. Elsewhere singular "they"
  // does the work, which also avoids guessing anything about who they are.
  const solo = namedParents(ws.members).length === 1;

  if (ws.status === "decided") {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 text-3xl">✦</div>
        <h1 className="font-display text-3xl text-pewter">
          They&apos;ve chosen {ws.babyCount > 1 ? "their names" : "a name"}!
        </h1>
        <p className="mt-3 text-ink-soft">
          {parentLine} {solo ? "has" : "have"} already found the{" "}
          {ws.babyCount > 1 ? "names" : "name"} for {babiesLabel(ws.babyLabel, ws.babyCount)}. Thank
          you so much for being part of it.
        </p>
      </main>
    );
  }

  // The window closing is a write refusal like any other (`/api/suggest` sends
  // 409), and this page has to know it before it draws the form. It didn't —
  // so an expired journey showed a guest the full form, the placeholder asking
  // for the story behind the name, and a button that could only ever fail. The
  // card on the gift table keeps pointing here long after the window ends.
  if (hasExpired(ws)) {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 text-3xl">✦</div>
        <h1 className="font-display text-3xl text-pewter">Suggestions have closed</h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          {parentLine} {solo ? "isn't" : "aren't"} collecting names here any more. If you&apos;ve
          got one you love, it&apos;s worth telling them yourself — and they can reopen this if
          they&apos;d like to.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <header className="mb-8 text-center">
        <Link href="/" className="font-display text-lg font-semibold text-pewter">
          Namesake
        </Link>
        <h1 className="mt-6 font-display text-4xl leading-tight text-ink">
          Help {parentLine} name{" "}
          <span className="italic text-sage-deep">{babiesLabel(ws.babyLabel, ws.babyCount)}</span>
        </h1>
        <p className="mt-3 text-ink-soft">
          They&apos;d love your ideas. Suggest a name you adore — a family name, one with a
          story, anything that feels right. Your note goes straight to them.
          {ws.babyCount > 1 &&
            ` They're expecting ${ws.babyCount === 3 ? "triplets" : "twins"}, so they need ${ws.babyCount === 3 ? "three names" : "two names"} that work together.`}
        </p>
      </header>
      <SuggestForm slug={slug} babyLabel={babiesLabel(ws.babyLabel, ws.babyCount)} />
      <p className="mt-6 text-center text-xs text-ink-soft">
        Your suggestion is private to the parents. No account needed.
      </p>
    </main>
  );
}
