"use client";

// "It's a surprise" is a first-class answer, not a refusal to answer. Someone
// who's chosen not to find out has made a decision about their pregnancy, and
// the form shouldn't treat it as a blank.
const OPTIONS = [
  { value: "girl", label: "A girl", plural: "Girls", className: "text-mark-girl", min: 1 },
  { value: "boy", label: "A boy", plural: "Boys", className: "text-mark-boy", min: 1 },
  // Only exists once there's more than one baby — and for the couple expecting
  // a boy and a girl it's the only true answer, so leaving it out would make
  // them pick something wrong or nothing at all.
  { value: "mixed", label: "One of each", plural: "One of each", className: "text-mark-either", min: 2 },
  { value: "surprise", label: "It's a surprise", plural: "It's a surprise", className: "text-mark-either", min: 1 },
] as const;

export type Expecting = (typeof OPTIONS)[number]["value"];

export default function ExpectingChoice({
  value,
  onChange,
  label = "Are you expecting…",
  babyCount = 1,
}: {
  value: Expecting | "";
  onChange: (v: Expecting | "") => void;
  label?: string;
  /// Two babies make "a girl" read as a half-answer: it's two girls.
  babyCount?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
        {label}
        <span className="text-xs font-normal text-ink-soft">optional</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.filter((o) => babyCount >= o.min).map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              // Tapping the chosen one again clears it — otherwise there's no
              // way back to "I'd rather not say" once you've touched it.
              onClick={() => onChange(on ? "" : o.value)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition ${
                on
                  ? "border-sage-deep bg-sage-deep text-white"
                  : "border-line bg-paper text-ink-soft hover:border-sage"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3.5 w-3.5 ${on ? "text-white" : o.className}`}
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 21s-8-5-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16 12 21 12 21z" />
              </svg>
              {babyCount > 1 ? o.plural : o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
