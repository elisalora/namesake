import Link from "next/link";
import DuckMark, { OrnamentRule } from "@/components/DuckMark";
import { supportAddress } from "@/lib/email";

export const metadata = {
  title: "Namesake — refunds",
  description:
    "Fourteen days from purchase, for any reason. Boxes refundable until posted; personalised keepsakes until they're made.",
};

// Written to be read by someone who is slightly annoyed. Short sentences,
// no conditions hiding in a clause, and the awkward cases answered rather
// than left to a conversation.
export default function RefundsPage() {
  // Read per-render, not at module scope: this is the address a policy page
  // publishes, and it should follow the environment it's deployed into rather
  // than whatever was set when the bundle was built.
  const SUPPORT = supportAddress();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <DuckMark className="h-5 w-auto text-pewter-light" />
          <span className="font-display text-2xl tracking-tight text-pewter">Namesake</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-ink-soft">
          <Link href="/faq" className="transition hover:text-sage-deep">
            Questions
          </Link>
          <Link href="/gift" className="transition hover:text-sage-deep">
            Give as a gift
          </Link>
        </div>
      </header>

      <section className="animate-rise py-14">
        <p className="engraved">Refunds</p>
        <h1 className="mt-5 font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
          If it isn&apos;t <span className="italic text-sage-deep">right, say so.</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft">
          The short version: fourteen days from the day you bought it, for any reason at all.
          No form, no phone call, and nobody asking you to reconsider.
        </p>
      </section>

      <div className="space-y-11 pb-8">
        <Clause q="Fourteen days, whatever the reason">
          <p>
            Full refund within fourteen days of purchase. You don&apos;t need to have a reason,
            and you don&apos;t need to explain the one you have.
          </p>
          <p>
            The money goes back to whoever paid — so for a gift, that&apos;s you, not the person
            you bought it for.
          </p>
          <p>
            After fourteen days the journey is yours for the window you bought. If something has
            genuinely gone wrong, write to us anyway — this is a policy, not a wall.
          </p>
        </Clause>

        <Clause q="Boxes">
          <p>
            Refundable in full until the box is posted. Once it&apos;s on its way we can&apos;t
            recall it, but the journey inside it still follows the rule above — within fourteen
            days, that part is refundable whether or not the box has gone.
          </p>
        </Clause>

        <Clause q="Personalised keepsakes">
          <p>
            An embroidered blanket, a framed print: refundable right up until
            it&apos;s made, which only happens once the name is settled. After that it can&apos;t
            be — it has their name on it, and there is nobody else it could go to.
          </p>
        </Clause>

        <Clause q="Extra time">
          <p>
            Refundable within fourteen days, as long as the time you bought hasn&apos;t already
            been used.
          </p>
        </Clause>

        <Clause q="How to ask">
          <p>
            Write to{" "}
            <a
              href={`mailto:${SUPPORT}`}
              className="font-semibold text-sage-deep underline underline-offset-4 hover:text-pewter"
            >
              {SUPPORT}
            </a>{" "}
            from the address you bought with, and say which purchase. That&apos;s all we need.
          </p>
          <p>
            Refunds go back to the original card. Your bank usually takes a few days longer than
            we do.
          </p>
        </Clause>
      </div>

      <OrnamentRule className="mx-auto max-w-xs" />

      <section className="py-12 text-center">
        <p className="text-lg leading-relaxed text-ink-soft">
          Still deciding? The{" "}
          <Link href="/faq" className="font-semibold text-sage-deep hover:text-pewter">
            questions page
          </Link>{" "}
          covers what this is and what it isn&apos;t.
        </p>
      </section>

      <footer className="border-t border-line pt-7 text-center">
        <DuckMark className="mx-auto h-4 w-auto text-pewter-light" />
        <p className="mt-2.5 text-sm text-ink-soft">Namesake</p>
      </footer>
    </main>
  );
}

function Clause({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-3xl leading-snug text-pewter">{q}</h2>
      <div className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
