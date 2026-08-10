// One reading of "is this a due date", shared by everywhere that takes one.
//
// It used to be read in three places with three different amounts of care.
// `PATCH /api/workspaces/[id]` checked the date parsed and stopped there; the
// journey draft didn't check at all (`z.string().optional()`), which is the
// field a *gift recipient* fills in at redemption — so the least-guarded copy
// was the one on the money path. Both of the bugs that came out of that were
// the same missing line, which is why this is a module rather than a fix in
// two files that would drift apart again.

/// How far either side of today a due date can plausibly sit.
///
/// Forward is generous against a pregnancy — nine months plus slack for
/// someone typing an estimate early. Backward is wider on purpose: this
/// product is also used to reconstruct a naming after the birth, and telling
/// someone their child's actual birthday "doesn't look right" would be worse
/// than anything the bound is protecting against.
export const DUE_DATE_MAX_MONTHS_AHEAD = 12;
export const DUE_DATE_MAX_MONTHS_BEHIND = 24;

/// A month count as somebody would say it out loud.
function inWords(months: number) {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "a year" : `${years === 2 ? "two" : years} years`;
  }
  return months === 1 ? "a month" : `${months} months`;
}

/// The one sentence anybody is shown when a due date is refused.
///
/// Built from the two numbers above rather than restating them, because a
/// sentence that quotes a bound is wrong the moment somebody changes the
/// bound — and it is wrong in the worst way, confidently and in front of a
/// customer.
///
/// The last clause is the useful one. A mistyped year is overwhelmingly what
/// causes this, and naming the likely slip beats any amount of politeness.
/// Note what it deliberately doesn't say: not "use a real date". The backward
/// bound is wide precisely because people reconstruct a naming *after* the
/// birth, so the person most likely to meet the lower edge is someone who
/// typed their child's actual birthday — and this sentence can land on the
/// first screen of opening a present.
export const DUE_DATE_MESSAGE =
  `That date is outside what we can take — anywhere from ${inWords(DUE_DATE_MAX_MONTHS_BEHIND)} ` +
  `ago to ${inWords(DUE_DATE_MAX_MONTHS_AHEAD)} ahead. If it looks right to you, check the year.`;

function shiftMonths(from: Date, months: number) {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Jan 31 + 1 month is Mar 3 by default; clamp to the last day of the target
  // month, the same way `addMonths` in lib/purchase.ts does.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/// A due date, or null if the string isn't one we'll accept.
///
/// Null covers three different wrongs deliberately — unparseable ("banana"),
/// absurd ("2999-01-01"), and the JS maximum ("+275760-09-12") — because none
/// of them has a different answer: don't store it, and don't let it decide how
/// long anybody's window is.
export function parseDueDate(value: string | null | undefined, now = new Date()): Date | null {
  if (!value) return null;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > shiftMonths(now, DUE_DATE_MAX_MONTHS_AHEAD).getTime()) return null;
  if (d.getTime() < shiftMonths(now, -DUE_DATE_MAX_MONTHS_BEHIND).getTime()) return null;
  return d;
}

/// Whether a string is an acceptable due date *or* absent. The form field is
/// optional, and "left blank" is a real answer — a couple who'd rather not
/// say — not a validation failure.
export function isDueDateOrBlank(value: string | null | undefined, now = new Date()) {
  if (value === undefined || value === null || value.trim() === "") return true;
  return parseDueDate(value, now) !== null;
}
