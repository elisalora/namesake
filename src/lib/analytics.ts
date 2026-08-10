import { track } from "@vercel/analytics/server";
import type { FunnelEvent } from "@/lib/funnel";

// Server-side half of the funnel. Never import this from a client component —
// `@vercel/analytics/server` throws outright if it finds itself in a browser.
//
// Two things about the underlying `track` are worth knowing here rather than
// finding out from a silent zero in the dashboard:
//
//   1. **It needs the request's headers.** Given none, it throws internally,
//      catches its own throw, logs, and sends nothing. There is a Vercel
//      request context it can fall back on, but a measurement that only works
//      because of an ambient global is a measurement that stops working
//      without telling you. Every caller here passes headers explicitly.
//   2. **Off Vercel it is a no-op** — with no VERCEL_URL it logs the event to
//      the console and returns. That is exactly what we want locally: the call
//      still runs, so a broken call site shows up in `npm run dev`, and
//      nothing is sent anywhere.
//
// It is also, deliberately, never awaited by a caller in a way that can fail a
// request. Analytics is not allowed to break checkout.

/// What may travel with an event.
///
/// Scalars only — the SDK rejects nested objects — and **nothing that
/// identifies a person.** No email, no name, no workspace id. These land in a
/// third party's dashboard and stay there; the questions worth asking of them
/// ("did anyone pay", "which tier") are all answerable from counts.
type Props = Record<string, string | number | boolean | null | undefined>;

export function trackFunnel(
  event: FunnelEvent,
  props: Props,
  headers: Headers,
): Promise<void> {
  return track(event, props, { headers }).catch((err) => {
    console.error(`[namesake] analytics "${event}" failed`, err);
  });
}
