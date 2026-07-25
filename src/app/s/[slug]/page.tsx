import Link from "next/link";
import { db } from "@/lib/db";
import SuggestForm from "@/components/SuggestForm";

export default async function SuggestPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ws = await db.workspace.findUnique({
    where: { suggestSlug: slug },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  if (!ws) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center text-ink-soft">
        This suggestion link doesn&apos;t seem to exist.
      </main>
    );
  }

  const parents = ws.members.map((m) => m.name).filter(Boolean);
  const parentLine = parents.length === 2 ? `${parents[0]} & ${parents[1]}` : parents[0] || "the parents";

  if (ws.status === "decided") {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 text-3xl">✦</div>
        <h1 className="font-display text-3xl text-pewter">They&apos;ve chosen a name!</h1>
        <p className="mt-3 text-ink-soft">
          {parentLine} have already found the name for {ws.babyLabel}. Thank you so much for being
          part of it.
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
          Help {parentLine} name <span className="italic text-sage-deep">{ws.babyLabel}</span>
        </h1>
        <p className="mt-3 text-ink-soft">
          They&apos;d love your ideas. Suggest a name you adore — a family name, one with a story,
          anything that feels right. Your note goes straight to them.
        </p>
      </header>
      <SuggestForm slug={slug} babyLabel={ws.babyLabel} />
      <p className="mt-6 text-center text-xs text-ink-soft">
        Your suggestion is private to the parents. No account needed.
      </p>
    </main>
  );
}
