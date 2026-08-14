"use client";

import { useSearchParams } from "next/navigation";
import StartForm, { type StartPrefill } from "./StartForm";
import { cleanNamePart } from "@/lib/nameInput";

// Reading the handoff from `/check` on the client, and the reason is measured.
//
// The obvious version is `searchParams` on the page — three lines, no extra
// component. It also turns the storefront from `○` into `ƒ`: awaiting
// `searchParams` opts the route out of prerendering, so every landing view
// becomes a server render instead of a file off the CDN. That is the top of
// the funnel, on the page we are about to point traffic at, made slower for
// everybody to serve a query string almost nobody arrives with.
//
// So the page stays static and this reads the parameters after hydration,
// inside a `Suspense` boundary — which is what lets everything above it be
// prerendered rather than the whole tree bailing out to client rendering.
//
// Cleaned here as well as at the source. `/check` builds this link, but a
// query string is a thing anyone can type, and the draft schema and the
// shortlist row downstream are both entitled to assume it was bounded.
export default function StartHandoff({ priceLabel }: { priceLabel: string }) {
  const params = useSearchParams();
  const first = cleanNamePart(params.get("first"));
  const prefill: StartPrefill | undefined = first
    ? {
        lastName: cleanNamePart(params.get("last")),
        seedName: { firstName: first, middleName: cleanNamePart(params.get("middle")) },
      }
    : undefined;

  return <StartForm priceLabel={priceLabel} prefill={prefill} />;
}
