import type { Metadata } from "next";
import Link from "next/link";
import CheckTool from "@/components/CheckTool";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import TrackView from "@/components/TrackView";
import { FUNNEL } from "@/lib/funnel";

// The front door.
//
// Everything else this app serves is either a storefront or somebody's private
// room. This is the only page where a stranger gets a real answer out of us
// without giving us anything — no address, no account, nothing to cancel —
// and it is the whole of our case that the product is worth opening.
//
// It gives away `analyzeName()`, which is the one genuinely differentiated
// thing in the repository. That was Elisabeth's call and the argument for it
// is short: the tool is not the product. The room is. A model will happily
// opine on how a first name sounds against a surname; what it will not do is
// end in a shortlist two people rate, somewhere to put everyone else's
// opinions, and a page telling the story of the name. We give away the
// doorbell, never the room.

const TITLE = "Check a whole baby name — initials, surname, siblings | Namesake";
const DESCRIPTION =
  "Free. Type the first, middle and last name and see the initials, how it joins your surname, and how it sits beside a brother or sister's. Nothing to sign up for.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/check" },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function CheckPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <TrackView event={FUNNEL.checkView} />
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <DuckMark className="h-5 w-auto text-pewter-light" />
          <span className="font-display text-2xl tracking-tight text-pewter">Namesake</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-ink-soft">
          <Link href="/faq" className="transition hover:text-sage-deep">
            Questions
          </Link>
          <Link href="/signin" className="transition hover:text-sage-deep">
            Sign in
          </Link>
        </div>
      </header>

      <section className="py-14">
        <p className="engraved">Free · nothing to sign up for</p>
        <h1 className="mt-5 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">
          You picked the first name.
          <br />
          Now <span className="italic text-sage-deep">hear the whole thing.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Initials, the join with your surname, and how it sits beside a brother or sister&apos;s. The
          things you notice on the birth certificate, a month too late.
        </p>
        <OrnamentRule className="mt-9 max-w-xl" />
      </section>

      <CheckTool />

      <footer className="mt-16 border-t border-line pt-7 text-center">
        <DuckMark className="mx-auto h-4 w-auto text-pewter-light" />
        <p className="mt-2.5 text-sm text-ink-soft">
          <Link href="/" className="hover:text-sage-deep">
            Namesake
          </Link>
          <span className="mx-2 text-line">·</span>
          <Link href="/faq" className="hover:text-sage-deep">
            Questions
          </Link>
          <span className="mx-2 text-line">·</span>
          <Link href="/gift" className="hover:text-sage-deep">
            Give as a gift
          </Link>
        </p>
      </footer>
    </main>
  );
}
