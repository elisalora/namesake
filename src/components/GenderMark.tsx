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

export default function GenderMark({
  gender,
  withLabel = true,
}: {
  gender?: string | null;
  withLabel?: boolean;
}) {
  const g = normalizeGender(gender);
  if (!g) return null;
  const mark = MARKS[g];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${mark.className}`}
      title={`${mark.label} name`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M12 21s-8-5-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16 12 21 12 21z" />
      </svg>
      {withLabel ? mark.label : <span className="sr-only">{mark.label} name</span>}
    </span>
  );
}
