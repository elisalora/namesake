"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { FUNNEL } from "@/lib/funnel";
import { cleanCheckInput, runCheck, EMPTY_INPUT, type CheckInput, type CheckResult } from "@/lib/checkPage";
import { NAME_MAX } from "@/lib/nameInput";
import type { CheckLevel } from "@/lib/nameChecks";

// The free checker.
//
// **Everything here happens in the browser.** `analyzeName` has no imports of
// its own and is pure and synchronous, so there is no route behind this, no
// database, and nothing to fetch. That is not an implementation detail — it is
// what the line under the form is a promise about.
//
// **And the name never enters the URL.** A result at
// `/check?first=Eleanor&last=Whitfield` would put a stranger's child's name
// into pathname analytics and into the access log of every hop between them
// and us, without anybody deciding to do that. Result URLs would buy an
// indexable page — except `analyzeName` returns nothing at all without a first
// name, so a `/check/<surname>` page has no content until somebody types into
// it, and a query-string result is not something anyone links to. There is no
// tail to give up. So results live in component state and the address bar
// never changes.
//
// The one place a name does leave the browser is the share card, which has to
// be drawn on a server, and only when somebody asks for one. See the button.

const CHECK_STYLE: Record<CheckLevel, { dot: string; text: string }> = {
  watch: { dot: "bg-gold", text: "text-[#8a6d1f]" },
  delight: { dot: "bg-sage", text: "text-sage-deep" },
  info: { dot: "bg-sage", text: "text-ink-soft" },
};

const COUNT_WORD = [
  "No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
];

function countWord(n: number) {
  return COUNT_WORD[n] ?? String(n);
}

export default function CheckTool() {
  const [form, setForm] = useState<CheckInput>(EMPTY_INPUT);
  /// The checked name, held apart from what is currently in the boxes. Editing
  /// a field must not silently rewrite the answer under the heading that says
  /// what we found — the visitor asked one question and this is the answer to
  /// that question until they ask another.
  const [asked, setAsked] = useState<CheckInput | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const result = useMemo(() => (asked ? runCheck(asked) : null), [asked]);

  function set<K extends keyof CheckInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = cleanCheckInput(form);
    if (!input.first) return;
    setAsked(input);
    setCardUrl(null);
    const checked = runCheck(input);
    // Counts and booleans. Nothing here is the name.
    track(FUNNEL.checkRun, {
      hasMiddle: Boolean(input.middle),
      hasSurname: Boolean(input.last),
      hasSibling: Boolean(input.sibling),
      findings: checked.findings.length,
      topLevel: checked.findings[0]?.level ?? "none",
    });
  }

  function makeCard() {
    if (!result) return;
    const q = new URLSearchParams({ first: result.input.first });
    if (result.input.middle) q.set("middle", result.input.middle);
    if (result.input.last) q.set("last", result.input.last);
    if (result.input.sibling) q.set("sibling", result.input.sibling);
    setCardUrl(`/check/card?${q}`);
    track(FUNNEL.checkCard, { findings: result.findings.length });
  }

  const handoffHref = result
    ? `/?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({
            first: result.input.first,
            middle: result.input.middle,
            last: result.input.last,
          }).filter(([, v]) => v),
        ),
      )}`
    : "/";

  return (
    <>
      <form
        onSubmit={submit}
        className="rounded-[1.75rem] border border-line bg-card p-7 shadow-[0_28px_70px_-40px_rgba(65,74,69,0.45)]"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" value={form.first} onChange={(v) => set("first", v)} placeholder="Eleanor" />
          <Field
            label="Middle name"
            hint="optional"
            value={form.middle}
            onChange={(v) => set("middle", v)}
            placeholder="Rose"
          />
          <Field label="Surname" value={form.last} onChange={(v) => set("last", v)} placeholder="Whitfield" />
          {/* Nobody else offers this one, and it reaches the checks most
              likely to say something true rather than nothing. */}
          <Field
            label="Sibling's name"
            hint="optional"
            value={form.sibling}
            onChange={(v) => set("sibling", v)}
            placeholder="Arthur"
          />
        </div>

        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-sage-deep py-3.5 font-display text-lg text-white transition hover:bg-pewter"
        >
          Check the whole name
        </button>
        <p className="mt-3 text-center text-xs text-ink-soft">We don&apos;t save what you type here.</p>
      </form>

      {result && (
        <section className="mt-10 animate-rise">
          {result.needsSurname ? (
            <>
              {/* Not a finding about the name — an instruction about the form,
                  which is why `runCheck` keeps it out of the findings list and
                  it gets its own block here. */}
              <p className="rounded-2xl bg-paper-2/60 px-5 py-4 leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink">Add the surname and there&apos;s more to see.</span>{" "}
                The initials, how the two names join, and the whole thing written out. Just the family
                name — we don&apos;t need yours.
              </p>
              {result.findings.length > 0 && <Findings result={result} className="mt-6" />}
            </>
          ) : result.findings.length > 0 ? (
            <>
              <h2 className="font-display text-3xl text-ink">
                {countWord(result.findings.length)} thing{result.findings.length === 1 ? "" : "s"} worth a
                glance.
              </h2>
              <Findings result={result} className="mt-5" />
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl text-ink">
                Nothing to flag — and that&apos;s the usual answer.
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
                We looked at <LookedAt result={result} />. Nothing collides and nothing rhymes by
                accident.
              </p>
              <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
                The harder questions — whether it suits him, whether your mother will ever actually use
                it, whether it survives a playground — aren&apos;t ones a checker can answer.
              </p>
            </>
          )}

          <div className="mt-8">
            {cardUrl ? (
              <figure>
                {/* Rendered into the page rather than pointed at from `<head>`,
                    because Pinterest's Save button pins an image that is *on*
                    the page — a social card in metadata is invisible to it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cardUrl}
                  alt={`${result.fullName} — the result of a Namesake name check`}
                  width={1000}
                  height={1500}
                  className="w-full max-w-[320px] rounded-xl border border-line"
                  data-pin-media={typeof window === "undefined" ? undefined : `${window.location.origin}${cardUrl}`}
                  data-pin-description={`${result.fullName} — checked on Namesake`}
                />
                <figcaption className="mt-2 max-w-[320px] text-xs leading-relaxed text-ink-soft">
                  Save it, or press and hold to keep it.
                </figcaption>
              </figure>
            ) : (
              <>
                <button
                  type="button"
                  onClick={makeCard}
                  className="rounded-full border border-sage-deep px-6 py-2.5 font-display text-lg text-sage-deep transition hover:bg-sage-deep hover:text-white"
                >
                  Make a card to share
                </button>
                {/* The one qualifier on this page, and it belongs here rather
                    than under the form: the check runs in the browser and
                    sends nothing, but a card has to be drawn on a server, so
                    pressing this is the moment the name leaves. Marzipan's
                    string, and the web log is named on purpose — anybody who
                    reads a privacy line at all knows requests are logged, and
                    the note that quietly omits the one true caveat is the note
                    that costs us the reader. */}
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-ink-soft">
                  The card is drawn on our server, so this is the one step that sends the name to us.
                  It becomes a picture and a line in a web log — not an account, and not a mailing
                  list.
                </p>
              </>
            )}
          </div>

          <div className="mt-12 rounded-[1.75rem] border border-line bg-butter-soft/60 px-8 py-7">
            <h3 className="font-display text-2xl text-pewter">The rest of it takes longer.</h3>
            <p className="mt-2.5 max-w-2xl leading-relaxed text-ink-soft">
              Namesake is a private room for the two of you: a shortlist you both rate, one place for
              everyone else&apos;s opinions instead of across a table, and a consultant that asks about
              your grandmother rather than your favourite letter.
            </p>
            <p className="mt-3 text-sm text-ink-soft">Ten conversations free. No card.</p>
            <Link
              href={handoffHref}
              onClick={() => track(FUNNEL.checkStart, { findings: result.findings.length })}
              className="mt-5 inline-block rounded-full bg-sage-deep px-7 py-3 font-display text-lg text-white transition hover:bg-pewter"
            >
              Start with {result.fullName} →
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

function Findings({ result, className = "" }: { result: CheckResult; className?: string }) {
  return (
    <ul className={`space-y-3 ${className}`}>
      {result.findings.map((c, i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl bg-paper-2/60 px-5 py-4">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${CHECK_STYLE[c.level].dot}`} />
          <span className="leading-relaxed text-ink-soft">
            <span className={`font-semibold ${CHECK_STYLE[c.level].text}`}>{c.title}.</span> {c.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/// What we actually looked at, assembled from the fields that were filled in.
///
/// A fixed sentence here would claim we checked how three names read together
/// when only two were given — which is the same defect as a check that fires
/// to announce it found nothing, one level up: a true-sounding sentence about
/// work that didn't happen. The clauses are verbatim from the copy deck; the
/// only thing computed is which of them are honest.
function LookedAt({ result }: { result: CheckResult }) {
  const { input, initials } = result;
  const clauses: React.ReactNode[] = [];
  if (initials.length >= 2) {
    clauses.push(
      <>
        the initials (<strong className="font-semibold text-ink">{initials}</strong>)
      </>,
    );
  }
  if (input.last) {
    clauses.push(
      <>
        the join between <em>{input.first}</em> and <em>{input.last}</em>
      </>,
      <>the whole thing written out</>,
    );
  }
  if (input.middle) clauses.push(<>how the three names read together</>);
  if (input.sibling) {
    clauses.push(
      <>
        how it sits beside <em>{input.sibling}</em>
      </>,
    );
  }

  return (
    <>
      {clauses.map((clause, i) => (
        <span key={i}>
          {i > 0 && (i === clauses.length - 1 ? (clauses.length > 2 ? ", and " : " and ") : ", ")}
          {clause}
        </span>
      ))}
    </>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
      </span>
      <input
        type="text"
        value={value}
        maxLength={NAME_MAX}
        // No autocomplete. The browser's name fields are about the person
        // filling the form in, and this form is about somebody who isn't born.
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage focus:bg-card"
      />
    </label>
  );
}
