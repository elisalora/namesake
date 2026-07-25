// A small heart marking which way a name leans, filled in the colour of that
// lean. Sits beside the name as a label — never in the rating row, where a
// coloured heart would be mistaken for a score.

export type NameGender = "girl" | "boy" | "neutral";

const MARKS: Record<NameGender, { label: string; className: string }> = {
  girl: { label: "Girl", className: "text-mark-girl" },
  boy: { label: "Boy", className: "text-mark-boy" },
  neutral: { label: "Either", className: "text-mark-either" },
};

export function normalizeGender(value?: string | null): NameGender | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "girl" || v === "female" || v === "f") return "girl";
  if (v === "boy" || v === "male" || v === "m") return "boy";
  if (v === "neutral" || v === "unisex" || v === "either") return "neutral";
  return null;
}

/// The order a tap moves through, ending back at untagged.
const CYCLE: (NameGender | null)[] = ["girl", "boy", "neutral", null];

export function nextGender(current?: string | null): NameGender | null {
  const i = CYCLE.indexOf(normalizeGender(current) ?? null);
  return CYCLE[(i + 1) % CYCLE.length];
}

export default function GenderMark({
  gender,
  withLabel = true,
  onCycle,
}: {
  gender?: string | null;
  withLabel?: boolean;
  /// When present the mark becomes a button that tags the name by hand —
  /// enrichment can fail, disagree, or never have run.
  onCycle?: () => void;
}) {
  const g = normalizeGender(gender);

  if (!g) {
    if (!onCycle) return null;
    return (
      <button
        type="button"
        onClick={onCycle}
        title="Tag this as a girl's, boy's or either name"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft transition hover:border-sage hover:text-sage-deep"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 21s-8-5-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16 12 21 12 21z" />
        </svg>
        Tag
      </button>
    );
  }

  const mark = MARKS[g];
  const Tag = onCycle ? "button" : "span";

  return (
    <Tag
      {...(onCycle ? { type: "button" as const, onClick: onCycle } : {})}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${mark.className} ${
        onCycle ? "transition hover:opacity-70" : ""
      }`}
      title={onCycle ? `${mark.label} name — tap to change` : `${mark.label} name`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M12 21s-8-5-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16 12 21 12 21z" />
      </svg>
      {withLabel ? mark.label : <span className="sr-only">{mark.label} name</span>}
    </Tag>
  );
}
