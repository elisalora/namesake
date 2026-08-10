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

/// The one sentence anybody is shown when a due date is refused. Lives here
/// beside the rule it describes, so a change to one is a change to both.
export const DUE_DATE_MESSAGE =
  "That due date doesn't look right — use a real date, sometime around now.";

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
