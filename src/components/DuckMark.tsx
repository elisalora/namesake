// The house mark: a duck, drawn the way a silversmith would punch a hallmark
// into the base of a cup — one weight of line, no fill, no face beyond an eye.
//
// It stays small on purpose. At emblem size it reads as a mark; blown up it
// would read as a cartoon, which is the opposite of what this is for.
export default function DuckMark({
  className = "",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
    >
      {title && <title>{title}</title>}
      {/* Breast, body and tail in one line, the way it would be engraved. */}
      <path d="M45.2 22.2c-2.6 1.5-5.8 2.2-9.4 2.2H22.6c-7.9 0-14.3 4.3-14.3 9.6 0 3.4 3.1 5.6 7.7 5.6h19.4c9.6 0 17.2-6.2 17.2-13.8" />
      {/* Tail feather */}
      <path d="M8.4 31.6c-2.5-.6-4.3-1.9-5-3.4 2 .1 3.9.5 5.4 1.2" />
      <circle cx="45" cy="14" r="8.3" />
      {/* Bill */}
      <path d="M53.1 12.5c3.4-.5 6.2.7 6.6 2.1.4 1.4-1.9 2.9-5.2 3.3" />
      <circle cx="47.5" cy="12.3" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/// A hairline rule with the mark set into it — the divider on good stationery.
export function OrnamentRule({ className = "" }: { className?: string }) {
  return (
    <div className={`rule-ornament ${className}`} aria-hidden>
      <DuckMark className="h-4 w-auto shrink-0" />
    </div>
  );
}
