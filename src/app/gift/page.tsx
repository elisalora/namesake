import Link from "next/link";
import GiftForm from "@/components/GiftForm";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import { GIFT_TIERS, ADD_ONS, formatPrice, describeWindow } from "@/lib/pricing";

export const metadata = {
  title: "Give a Namesake journey",
  description:
    "A gift for expecting parents: the way to choose their child's name. A private room for the two of them, a card the whole shower can scan, and the story of the name at the end.",
};

// The gifter's storefront. A different person from the one who uses it, so
// this page sells the handover: what it feels like to give, and what they open.
export default function GiftPage() {
  const tiers = GIFT_TIERS.map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    blurb: t.blurb,
    price: formatPrice(t.amountCents, t.currency),
    window: describeWindow(t.window),
    physical: t.physical,
    boxContents: t.boxContents ?? [],
    featured: Boolean(t.featured),
  }));

  const addOns = Object.values(ADD_ONS).map((a) => ({
    id: a.id,
    name: a.name,
    blurb: a.blurb,
    price: formatPrice(a.amountCents),
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <DuckMark className="h-5 w-auto text-pewter-light" />
          <span className="font-display text-2xl tracking-tight text-pewter">Namesake</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-ink-soft">
          <Link href="/faq" className="transition hover:text-sage-deep">
            Questions
          </Link>
          <Link href="/" className="transition hover:text-sage-deep">
            For ourselves
          </Link>
          <Link href="/signin" className="transition hover:text-sage-deep">
            Sign in
          </Link>
        </div>
      </header>

      <section className="animate-rise py-14 text-center">
        <p className="engraved">A gift for expecting parents</p>
        <h1 className="mx-auto mt-5 max-w-3xl font-display text-6xl leading-[1.02] text-ink sm:text-7xl">
          A name is the first thing
          <br />
          they&apos;ll <span className="italic text-sage-deep">give their child.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">
          You&apos;re giving them the choosing of it — a private room for the two of them, an AI
          consultant that knows where every name comes from, and the story of the name at the end.
        </p>

        {/* The question a gifter actually has, answered before the prices. */}
        <ol className="mx-auto mt-12 grid max-w-3xl gap-8 text-left sm:grid-cols-3">
          {[
            ["You choose", "Pick how long it lasts and write them a note. We'll ask where to post it."],
            [
              "You hand it over",
              "The box comes to you, so you can give it in person. Or send it straight to their inbox.",
            ],
            [
              "They open it",
              "They scan the card, set up their room, and start choosing the name.",
            ],
          ].map(([t, d], i) => (
            <li key={t}>
              <span className="engraved">{`0${i + 1}`}</span>
              <div className="mt-1.5 font-display text-2xl text-pewter">{t}</div>
              <div className="mt-1 text-sm leading-relaxed text-ink-soft">{d}</div>
            </li>
          ))}
        </ol>

        <OrnamentRule className="mx-auto mt-14 max-w-xs" />
      </section>

      <GiftForm tiers={tiers} addOns={addOns} />

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          [
            "Your voice, on the card",
            "Your note is the first thing they read — and you can put a name forward yourself, without being the relative who pushes.",
          ],
          [
            "Somewhere for everyone else",
            "Guests scan a card and leave a name with the reason behind it, instead of offering opinions over cake.",
          ],
          [
            "Something at the end",
            "When they settle on a name, they get a page telling the story of how they chose it. For the baby book.",
          ],
        ].map(([t, d]) => (
          <div key={t} className="rounded-[1.25rem] border border-line bg-card/70 p-6">
            <div className="font-display text-xl text-pewter">{t}</div>
            <div className="mt-1.5 text-sm leading-relaxed text-ink-soft">{d}</div>
          </div>
        ))}
      </section>

      <footer className="mt-16 border-t border-line pt-7 text-center">
        <DuckMark className="mx-auto h-4 w-auto text-pewter-light" />
        <p className="mt-2.5 text-sm text-ink-soft">
          <Link href="/faq" className="hover:text-sage-deep">Questions</Link>
          <span className="mx-2 text-line">·</span>
          <Link href="/refunds" className="hover:text-sage-deep">Refunds</Link>
          <span className="mx-2 text-line">·</span>
          Namesake
        </p>
      </footer>
    </main>
  );
}
