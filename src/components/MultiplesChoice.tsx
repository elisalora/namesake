"use client";

import { MAX_BABIES } from "@/lib/babies";

// Asked at the very start, because it changes everything after it: two names
// instead of one, and every name from then on judged as half of a pair. It's
// one tap, and the answer is "one" for almost everybody — but the couple
// expecting twins has been quietly excluded from every naming tool they've
// tried, and shouldn't be excluded here too.
const OPTIONS = [
  { value: 1, label: "One baby" },
  { value: 2, label: "Twins" },
  { value: 3, label: "Triplets" },
] as const;

export default function MultiplesChoice({
  value,
  onChange,
  label = "How many are you naming?",
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.filter((o) => o.value <= MAX_BABIES).map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition ${
                on
                  ? "border-sage-deep bg-sage-deep text-white"
                  : "border-line bg-paper text-ink-soft hover:border-sage"
              }`}
            >
              <span aria-hidden className={on ? "text-white" : "text-pewter-light"}>
                {o.value === 1 ? "•" : o.value === 2 ? "••" : "•••"}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
