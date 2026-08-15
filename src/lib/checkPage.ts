import { analyzeName, NEEDS_SURNAME, type NameCheck, type Sibling } from "@/lib/nameChecks";
import { cleanNamePart } from "@/lib/nameInput";

// One reading of a name, for the free `/check` page.
//
// This is here rather than inside the page component for the seam it closes.
// Two things read that page's answer: the component a visitor looks at, and
// `/check/card`, which redraws the same answer as a PNG somebody then pins. If
// each computed its own, they would agree today and diverge the first time
// either changed — and the divergence would be invisible, because nobody sees
// the card and the page side by side. Both import this.
//
// The card deliberately takes only the *names* in its query string and runs
// the check itself, rather than being handed the findings to draw. It is an
// unauthenticated image endpoint on our own domain: everything it prints
// beyond the names has to be something we computed, not something a stranger
// asked us to write.

export type CheckInput = {
  first: string;
  middle: string;
  last: string;
  sibling: string;
};

export const EMPTY_INPUT: CheckInput = { first: "", middle: "", last: "", sibling: "" };

/// Bound whatever arrived — a form field or a query string — to what could be
/// a name. Same function on both paths, so the card can never render something
/// the page would have refused.
export function cleanCheckInput(raw: Partial<Record<keyof CheckInput, string | null>>): CheckInput {
  return {
    first: cleanNamePart(raw.first),
    middle: cleanNamePart(raw.middle),
    last: cleanNamePart(raw.last),
    sibling: cleanNamePart(raw.sibling),
  };
}

export type CheckResult = {
  input: CheckInput;
  /// The name as it would be written out. Empty when there is no first name.
  fullName: string;
  /// Two or more letters, or empty — a single initial is the first letter of a
  /// first name, not a monogram, and drawing it as one is a claim about
  /// nothing.
  initials: string;
  /// What to show. The "add your surname" prompt is not in here: on this page
  /// that isn't a finding about the name, it's an instruction about the form,
  /// and it has its own block of copy.
  findings: NameCheck[];
  /// True when there is a first name but no surname — the partial state.
  needsSurname: boolean;
};

export function runCheck(input: CheckInput): CheckResult {
  const { first, middle, last, sibling } = input;
  const parts = [first, middle, last].filter(Boolean);
  const siblings: Sibling[] = sibling
    // No label. Two boxes on a free page are not two babies — see the null
    // branch in `siblingChecks`, which is the only check that would have used
    // one and now says "the same name in both boxes" instead of inventing a
    // brother.
    ? [{ label: null, firstName: sibling, lastName: last || null }]
    : [];

  const checks = first ? analyzeName({ firstName: first, middleName: middle, lastName: last }, siblings) : [];

  return {
    input,
    fullName: parts.join(" "),
    initials: parts.length >= 2 ? parts.map((p) => p[0].toUpperCase()).join("") : "",
    // Matched on the exported constant rather than on the sentence, so
    // rewording that copy can't silently put the form instruction back into
    // the findings list.
    findings: checks.filter((c) => c.title !== NEEDS_SURNAME),
    needsSurname: Boolean(first) && !last,
  };
}
