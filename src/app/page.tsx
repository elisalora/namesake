import Link from "next/link";
import StartForm from "@/components/StartForm";
import { TIERS, formatPrice, describeWindow } from "@/lib/pricing";

export default function Home() {
  const plan = TIERS.self_serve;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="font-display text-2xl font-semibold tracking-tight text-plum">
          Namesake
        </div>
        <div className="flex items-center gap-5 text-sm text-ink-soft">
          <Link href="/gift" className="font-semibold transition hover:text-rose-deep">
            Give as a gift
          </Link>
          <Link href="/signin" className="font-semibold transition hover:text-rose-deep">
            Sign in
          </Link>
        </div>
      </header>

      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="animate-rise">
          <p className="mb-4 inline-block rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-deep">
            The naming journey
          </p>
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Choosing a name,
            <br />
            <span className="italic text-rose-deep">made gentle.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            A calm, private space where the two of you talk it through with a thoughtful
            consultant, shortlist together, gather ideas from the people you love — and
            arrive at a name you both adore, with a keepsake to remember why.
          </p>

          <ul className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            {[
              ["Talk it through", "A warm consultant helps you explore what feels like you."],
              ["Shortlist together", "Rate, comment, and hold quiet veto power — as a couple."],
              ["Gather the circle", "A link that invites family & friends to suggest names."],
              ["Keep the story", "End with a beautiful page on why you chose it."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-line bg-card/70 p-4">
                <div className="font-display text-lg text-plum">{t}</div>
                <div className="mt-1 text-sm text-ink-soft">{d}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="animate-rise rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
          <h2 className="font-display text-2xl text-ink">Start your journey</h2>
          <p className="mb-6 mt-1 text-sm text-ink-soft">
            {formatPrice(plan.amountCents, plan.currency)} for{" "}
            {describeWindow(plan.window).toLowerCase()}. You can change any of this later.
          </p>
          <StartForm priceLabel={formatPrice(plan.amountCents, plan.currency)} />
        </section>
      </div>

      <section className="mb-10 rounded-3xl border border-line bg-card/60 px-7 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <div className="font-display text-xl text-plum">Buying for someone else?</div>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
            Namesake makes a good baby-shower gift — there&apos;s a boxed version you can hand
            over in person, with your note on the card and a QR that lets the whole room suggest
            names.
          </p>
        </div>
        <Link
          href="/gift"
          className="mt-4 inline-block shrink-0 rounded-full border border-rose-deep px-6 py-3 font-display text-rose-deep transition hover:bg-rose-deep hover:text-white sm:mt-0"
        >
          See the gifts
        </Link>
      </section>

      <footer className="border-t border-line pt-6 text-center text-sm text-ink-soft">
        Made to feel like a keepsake. · Namesake
      </footer>
    </main>
  );
}
