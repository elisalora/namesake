// The four steps of the funnel, named once.
//
// Two of these are emitted from the browser and two from the server, so the
// names would otherwise be four string literals in four files agreeing by
// luck. A typo in one of them doesn't fail anything — it quietly opens a fifth
// event in the dashboard with almost the right name, and the step it was
// meant to count reads as zero. Import them.
//
// Deliberately no imports of its own: this is read by client components and by
// route handlers, and reaching for anything server-side here would drag it
// into the browser bundle.

export const FUNNEL = {
  /// Somebody arrived on the storefront. Duplicates the page view Vercel
  /// records automatically — kept as its own event so all four steps of the
  /// funnel are the same kind of measurement and can be read off one screen.
  landingView: "landing_view",
  /// They filled the start form in and it passed validation. The last thing
  /// that happens before we hand them to a payment page.
  startSubmit: "start_submit",
  /// A Purchase row exists and there is somewhere to pay. Not a sale.
  checkoutCreated: "checkout_created",
  /// Somebody spent the last of their free consultant turns.
  ///
  /// The step the free tier added, and the one that makes the rest legible.
  /// Without it a low purchase count is ambiguous between "nobody engaged"
  /// and "everybody engaged and refused to pay", and those have opposite
  /// fixes — one is a product problem, the other is a price problem.
  ///
  /// Fires on the turn that takes the count to its limit, not on the refusal
  /// afterwards and not on the wall rendering: both of those repeat, and this
  /// has to be a denominator.
  wallReached: "wall_reached",
  /// Money cleared and the grant was applied. The only one here that means
  /// revenue — and the numerator of the ratio worth watching, over
  /// `wallReached`.
  purchaseFulfilled: "purchase_fulfilled",

  /* ------------------------------------------------------- the free tool */

  /// Somebody opened `/check`. The denominator of the only ratio that page is
  /// judged on, so it is counted separately from `landingView` rather than
  /// folded into it — the two pages are asked completely different questions.
  checkView: "check_view",
  /// They actually checked a name. The gap between this and `checkView` is the
  /// difference between a page nobody understood and a page nobody wanted, and
  /// those have opposite fixes.
  checkRun: "check_run",
  /// They asked for a share card. The only signal we get that the result was
  /// worth keeping, and the one the whole Pinterest thesis rests on.
  checkCard: "check_card",
  /// They took the handoff into the journey. Paired with `checkView` this is
  /// the check→start ratio; the step that follows is the ordinary
  /// `startSubmit`, so the two halves of the funnel join up rather than
  /// running in parallel.
  ///
  /// **None of these four carry a name.** The page runs entirely in the
  /// browser and deliberately keeps what somebody types out of the URL as well
  /// — see the note in CheckTool. Counts and booleans only, which is what
  /// lib/analytics.ts asks of every event and what the privacy line under the
  /// form is a promise about.
  checkStart: "check_start",
} as const;

export type FunnelEvent = (typeof FUNNEL)[keyof typeof FUNNEL];
