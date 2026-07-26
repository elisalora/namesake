// A journey names one baby, or two, or three.
//
// Deliberately its own module with no imports, for the same reason lib/seat.ts
// is: the forms and the Dashboard need this vocabulary in the browser, and
// reaching into lib/journey.ts for it would drag Prisma into the client bundle.

export const MAX_BABIES = 3;

/// Which baby a chosen name belongs to. 1-based, so slot 1 reads as "the
/// first one" in the database as well as on screen.
export type Slot = number;

export function isMultiple(babyCount: number) {
  return babyCount > 1;
}

/// Every slot in order: [1], [1,2], [1,2,3].
export function slots(babyCount: number): Slot[] {
  return Array.from({ length: Math.max(1, babyCount) }, (_, i) => i + 1);
}

/// "Baby A", "Baby B", "Baby C" — the wording on hospital bracelets, and the
/// only labels that are true before anyone knows who will arrive first.
export function slotLabel(slot: Slot) {
  return `Baby ${String.fromCharCode(64 + slot)}`;
}

/// "twins" / "triplets", or "" for one baby.
export function multipleWord(babyCount: number) {
  return babyCount === 3 ? "triplets" : babyCount === 2 ? "twins" : "";
}

const NUMBER_WORD = ["", "one", "two", "three"];

export function countWord(n: number) {
  return NUMBER_WORD[n] ?? String(n);
}

/// How a journey refers to who it's for: the bump's nickname for one baby,
/// "the twins" for two — because "Peanut" stops making sense at two.
export function babiesLabel(babyLabel: string, babyCount: number) {
  if (babyCount <= 1) return babyLabel;
  // A label they chose themselves already speaks for both — "the Bumps",
  // "our two". Only the untouched default needs replacing.
  return babyLabel === "Baby" ? `the ${multipleWord(babyCount)}` : babyLabel;
}
