import Link from "next/link";
import StartForm from "@/components/StartForm";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import TrackView from "@/components/TrackView";
import { TIERS, formatPrice, describeWindow } from "@/lib/pricing";
import { FUNNEL } from "@/lib/funnel";

export default function Home() {
  const plan = TIERS.self_serve;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      {/* Step one of the funnel. Everything below is measured against it. */}
      <TrackView event={FUNNEL.landingView} />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <DuckMark className="h-5 w-auto text-pewter-light" />
          <span className="font-display text-2xl tracking-tight text-pewter">Namesake</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-ink-soft">
          <Link href="/faq" className="transition hover:text-sage-deep">
            Questions
          </Link>
          <Link href="/gift" className="transition hover:text-sage-deep">
            Give as a gift
          </Link>
          <Link href="/signin" className="transition hover:text-sage-deep">
            Sign in
          </Link>
        </div>
      </header>

      <div className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="animate-rise">
          <p className="engraved">For expecting parents</p>
          <h1 className="mt-5 font-display text-6xl leading-[1.02] text-ink sm:text-7xl">
            A name is the first
            <br />
            thing you <span className="italic text-sage-deep">give them.</span>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-soft">
            One place for the two of you: names gathered, rated and quietly set aside;
            everyone else&apos;s suggestions landing somewhere useful instead of over dinner; an
            AI consultant to think out loud with. It ends with a page telling the story of the
            name you chose.
          </p>

          <OrnamentRule className="mt-10 max-w-md" />

          <ul className="mt-8 grid max-w-lg gap-x-8 gap-y-6 sm:grid-cols-2">
            {[
              [
                "Two opinions, one place",
                "Rate, note, and quietly set aside. Neither of you has to defend anything out loud.",
              ],
              [
                "Somewhere to put everyone else",
                "A card at the shower they can scan — so opinions arrive where you can look at them later, not across a table.",
              ],
              [
                "A consultant, not a search box",
                "An AI that asks about your grandmother, not just your favourite letter — and is awake at three in the morning, when the question tends to arrive.",
              ],
              ["Something to keep", "The name, and why you chose it. Printed, for the baby book."],
            ].map(([t, d]) => (
              <li key={t}>
                <div className="font-display text-xl text-pewter">{t}</div>
                <div className="mt-1 text-sm leading-relaxed text-ink-soft">{d}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="animate-rise rounded-[1.75rem] border border-line bg-card p-8 shadow-[0_28px_70px_-40px_rgba(65,74,69,0.45)]">
          <p className="engraved">Begin</p>
          <h2 className="mt-3 font-display text-3xl text-ink">Start your journey</h2>
          <p className="mb-7 mt-2 text-sm text-ink-soft">
            {formatPrice(plan.amountCents, plan.currency)} for{" "}
            {describeWindow(plan.window).toLowerCase()}. Everything here can change later.
          </p>
          <StartForm priceLabel={formatPrice(plan.amountCents, plan.currency)} />
        </section>
      </div>

      <section className="mb-12 rounded-[1.75rem] border border-line bg-butter-soft/60 px-8 py-7 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div>
          <p className="engraved">For someone else</p>
          <div className="mt-2 font-display text-2xl text-pewter">
            The one people put on the registry
          </div>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            There is a boxed edition — a card in your own hand, and a second one the whole
            shower can scan. Handed over at the table, opened in front of everyone.
          </p>
        </div>
        <Link
          href="/gift"
          className="mt-5 inline-block shrink-0 rounded-full border border-sage-deep px-7 py-3 font-display text-lg text-sage-deep transition hover:bg-sage-deep hover:text-white sm:mt-0"
        >
          See the gifts
        </Link>
      </section>

      <footer className="border-t border-line pt-7 text-center">
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
