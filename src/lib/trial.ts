// The free tier, in one place.
//
// Deliberately no imports: this is read by the chat route, by the dashboard's
// client components, and by the probe, and reaching for Prisma here would drag
// it into the browser bundle. Everything below is a number or a sentence about
// a number.
//
// Three things are true of a trial journey and nothing else is:
//
//   1. Each parent gets FREE_TURNS consultant turns, counted on the *person*
//      and spent for good. Not per journey — per journey renews the trial
//      every time somebody starts a new one, which is a limit that isn't one.
//   2. The printable shower card is closed, and so is the keepsake.
//   3. Everything else is the whole product. Shortlist, ratings, notes, the
//      veto, the partner's seat, the family suggestion link, and the entire
//      conversation they've already had. None of it is ever taken away, and
//      the wall says so in as many words.
//
// "Lifetime" is an internal word here. It means *not per journey*, which is
// the loophole it was chosen to close. It is not a promise to anyone: the
// count hangs on a verified email address, and a second address is a second
// allowance. That leak is known, costs about sixty-five cents, and is
// deliberately not defended against — anti-abuse work here is negative value.
// No copy in the product claims otherwise.

/// Free consultant turns, per person, ever.
export const FREE_TURNS = 10;

/// How much room is left when the nudge appears. Two, so it lands while they
/// still have somewhere to go: a wall arriving mid-thought is the version
/// people resent, and the prompt reads as "keep going" rather than "pay up".
export const NUDGE_AT_REMAINING = 2;

/// How long a trial journey's window runs before the *time* runs out, as
/// opposed to the turns.
///
/// The same three months a paid journey gets, on purpose. The trial is meant
/// to be gated by what it does, not by a clock — two paywalls counting down at
/// once is confusing, and the one we want people to meet is the interesting
/// one. If a trial does reach the end of three months, the existing expired
/// banner handles it exactly as it handles any other journey.
export const TRIAL_MONTHS = 3;

/// Turns this person has left, given what they've spent. Never negative — a
/// count that has somehow overrun shows as nought rather than as a promise
/// running backwards.
export function turnsLeft(freeTurnsUsed: number) {
  return Math.max(0, FREE_TURNS - freeTurnsUsed);
}
