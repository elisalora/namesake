import Link from "next/link";
import GiftForm from "@/components/GiftForm";
import { PLANS, formatPrice } from "@/lib/pricing";

export const metadata = {
  title: "Give a Namesake journey",
  description:
    "A gift for expecting parents: six months of a calm, collaborative way to choose a name — and a keepsake at the end.",
};

export default function GiftPage() {
  const plan = PLANS.gift;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-plum">
          Namesake
        </Link>
        <Link href="/signin" className="text-sm font-semibold text-ink-soft hover:text-rose-deep">
          Sign in
        </Link>
      </header>

      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="animate-rise">
          <p className="mb-4 inline-block rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-deep">
            A gift
          </p>
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Give them the
            <br />
            <span className="italic text-rose-deep">gentler version.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            Naming a baby is one of the few decisions everyone has an opinion about. This is a quiet
            place for just the two of them to work it out — and a keepsake page at the end, for the
            baby book.
          </p>

          <ul className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            {[
              ["They set it up", "You give the gift; they describe the journey in their own words."],
              ["Six months", "Paid once. No subscription for them to cancel later."],
              ["Nothing to print", "It arrives by email, whenever you choose to send it."],
              ["Ends with something", "A keepsake page about why they chose the name."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-line bg-card/70 p-4">
                <div className="font-display text-lg text-plum">{t}</div>
                <div className="mt-1 text-sm text-ink-soft">{d}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="animate-rise rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
          <h2 className="font-display text-2xl text-ink">Send the gift</h2>
          <p className="mb-6 mt-1 text-sm text-ink-soft">
            {formatPrice(plan)} · {plan.months} months, theirs to set up.
          </p>
          <GiftForm priceLabel={formatPrice(plan)} />
        </section>
      </div>

      <footer className="border-t border-line pt-6 text-center text-sm text-ink-soft">
        Made to feel like a keepsake. · Namesake
      </footer>
    </main>
  );
}
