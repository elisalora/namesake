import Link from "next/link";
import GiftForm from "@/components/GiftForm";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import { GIFT_TIERS, ADD_ONS, formatPrice, describeWindow } from "@/lib/pricing";

export const metadata = {
  title: "Give a Namesake journey",
  description:
    "A gift for expecting parents: a calm, collaborative way to choose a name, in a box you can hand over at the shower — and a keepsake at the end.",
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
          Everyone has an opinion.
          <br />
          <span className="italic text-sage-deep">Give them somewhere to put it.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">
          The two of them get a private room and someone thoughtful to think it through with.
          Everyone else gets a card to scan. You get to be the one who gave it.
        </p>
        <OrnamentRule className="mx-auto mt-10 max-w-xs" />
      </section>

      <GiftForm tiers={tiers} addOns={addOns} />

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          [
            "You get a little say",
            "Your note goes on the card, and you can put a name forward yourself — without being the relative who pushes.",
          ],
          [
            "They get the room",
            "Every tier includes the shower QR: guests scan, suggest a name, and say why. No opinions ambushing them over cake.",
          ],
          [
            "It ends with something",
            "When they choose, they get a keepsake page telling the story of the name — for the baby book.",
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
        <p className="mt-2.5 text-sm text-ink-soft">Namesake</p>
      </footer>
    </main>
  );
}
