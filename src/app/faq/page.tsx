import Link from "next/link";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import { TIERS, GIFT_TIERS, formatPrice } from "@/lib/pricing";

export const metadata = {
  title: "Namesake — questions",
  description:
    "What the consultant is, what it costs, what a human naming consultant costs, and what happens to your journey when the time runs out.",
};

// The page that answers the question people are too polite to ask: is this a
// person? Leading with that, plainly, is worth more than any amount of hedging
// further down — someone paying to be advised should know what's advising them.
export default function FaqPage() {
  // The range has to come from the catalog, not from two tiers picked by hand.
  // Naming `sprout` and `whole_journey` quoted "$10 to $50" while Bloom — the
  // featured tier, the one this page exists to justify — sat above the ceiling
  // at $65. On a page whose whole argument is being straight about money, the
  // cheapest thing we sell to the dearest is the only defensible pair, and
  // every price here is env-overridable, so it has to be computed.
  const amounts = [...GIFT_TIERS, TIERS.self_serve].map((t) => t.amountCents);
  const cheapest = formatPrice(Math.min(...amounts));
  const dearest = formatPrice(Math.max(...amounts));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <DuckMark className="h-5 w-auto text-pewter-light" />
          <span className="font-display text-2xl tracking-tight text-pewter">Namesake</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-ink-soft">
          <Link href="/gift" className="transition hover:text-sage-deep">
            Give as a gift
          </Link>
          <Link href="/signin" className="transition hover:text-sage-deep">
            Sign in
          </Link>
        </div>
      </header>

      <section className="animate-rise py-14">
        <p className="engraved">Questions</p>
        <h1 className="mt-5 font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
          The ones worth <span className="italic text-sage-deep">asking first.</span>
        </h1>
      </section>

      <div className="space-y-12 pb-8">
        <Answer q="Is the consultant a real person?">
          <p>
            No. It&apos;s an AI, and we&apos;d rather say so on the first line than have you work
            it out three messages in.
          </p>
          <p>
            What it&apos;s good at happens to be most of what this particular job needs. It knows
            where names come from and how they&apos;ve travelled. It has read more of them than
            any one person could. It never tires of the question, never has a favourite it&apos;s
            quietly pushing, and it is awake at three in the morning — which, if you have been
            pregnant, you will recognise as when the question actually arrives.
          </p>
          <p>
            What it is not is a human expert with taste, instinct and a reputation on the line.
            If that&apos;s what you want, that is a genuinely different purchase.
          </p>
        </Answer>

        <Answer q="What does a human naming consultant cost?">
          <p>
            The best-known ones start around <strong className="text-ink">$1,500</strong> and rise
            steeply from there — one has named several hundred babies and describes a good part of
            the work as helping two people stop disagreeing.
          </p>
          <p>
            That is a real service and worth every penny to the people who buy it. It is also out
            of reach for almost everyone, which is the gap this sits in: {cheapest} to {dearest},
            for the same underlying structure — better questions than you&apos;d think to ask, a
            shortlist two people can actually converge on, and something to keep at the end.
          </p>
        </Answer>

        <Answer q="Couldn't we just ask ChatGPT?">
          <p>
            Yes. And you&apos;ll get good names out of it — ideas were never the scarce thing, and
            anyone telling you otherwise is selling a list.
          </p>
          <p>
            Then what, though. They live in a chat window on one of your phones. Your partner
            never sees half of them. When your aunt texts three suggestions there is nowhere to
            put them, so they sit in a message thread being slowly lost. And when you finally
            agree on something in month seven, the moment where one of you said <em>why</em> is
            four hundred messages back and gone.
          </p>
          <p>
            This is the other half. A place you can both see, where a name can be rated, quietly
            argued with, and set aside without anyone having to say it out loud. A link that
            sends everyone else&apos;s opinions somewhere useful instead of across a table at a
            shower. And a page at the end that remembers the reasoning — which is the first thing
            to fade and the thing you&apos;ll most want later.
          </p>
          <p className="text-ink">
            The consultant is the easy part. The organising is the part you actually needed.
          </p>
        </Answer>

        <Answer q="What is it actually good at? And what isn't it?">
          <p>
            Good at: where a name comes from and what it has meant; how it sounds against your
            surname; the things you&apos;d want quietly flagged before you commit — initials that
            spell something, a rhyme you hadn&apos;t heard, a spelling you&apos;d be correcting
            forever. Good, too, at holding both of your stated preferences at once and finding the
            overlap.
          </p>
          <p>
            Not good at: taste. It does not know your family, your history or what you&apos;ll
            feel the first time you say the name out loud in a hospital corridor. It will not tell
            you that you are wrong, and it cannot promise you&apos;ll love the result. The
            deciding stays yours — that is rather the point of it.
          </p>
        </Answer>

        <Answer q="Who can see our shortlist?">
          <p>
            The two of you, and nobody else. Ratings and vetoes are visible to each other — that
            is what makes it a conversation rather than two private lists — but nothing leaves the
            room.
          </p>
          <p>
            The suggestion link you share works one way: family and friends can put a name in and
            say why, and they never see what you thought of it.
          </p>
        </Answer>

        <Answer q="Is this a subscription?">
          <p>
            No. You pay once. Nothing renews, there is nothing to cancel, and no card is kept on
            file waiting for a date months from now. Naming ends, and so should the charging.
          </p>
          <p>
            If you need longer, you can add more time whenever you like — from where your window
            currently ends, so buying early never costs you the time you already paid for.
          </p>
        </Answer>

        <Answer q="What happens when our time runs out?">
          <p>
            Everything you wrote stays, and stays readable — the shortlist, the conversation, the
            keepsake. What stops is adding to it: no new names, ratings or notes until you extend.
          </p>
          <p>Nothing is deleted, and nothing is held hostage.</p>
        </Answer>

        <Answer q="We were given this, and we've already chosen a name.">
          <p>
            Then the useful part is the end rather than the middle. Put the name in, write down
            why you chose it while you still remember exactly, and keep the page. That story is
            the thing that fades first — and the thing you&apos;ll most want later.
          </p>
        </Answer>

        <Answer q="Can we get a refund?">
          <p>
            Fourteen days from purchase, for any reason — no form and no phone call.
          </p>
          <p>
            Boxes are refundable until they&apos;re posted. The one thing that isn&apos;t is a
            personalised keepsake once it&apos;s been made, because it has their name on it.{" "}
            <Link
              href="/refunds"
              className="font-semibold text-sage-deep underline underline-offset-4 hover:text-pewter"
            >
              The whole policy
            </Link>{" "}
            is a short read.
          </p>
        </Answer>

        <Answer q="What actually arrives in the box?">
          <p>
            Two cards. One in your own words, carrying the link that opens their journey. One for
            the gift table, which guests can scan to leave a name and the reason behind it.
          </p>
          <p>
            Any keepsake you add — an embroidered blanket, a framed print — is
            made after they&apos;ve settled on the name, and sent on to them directly. It cannot
            be made before there is a name to put on it.
          </p>
        </Answer>
      </div>

      <OrnamentRule className="mx-auto max-w-xs" />

      <section className="py-12 text-center">
        <p className="text-lg leading-relaxed text-ink-soft">Still wondering something?</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-sage-deep px-7 py-3 font-display text-lg text-white transition hover:bg-pewter"
        >
          Start a journey
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

function Answer({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-3xl leading-snug text-pewter">{q}</h2>
      <div className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
