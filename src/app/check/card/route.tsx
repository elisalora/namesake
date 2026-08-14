import { ImageResponse } from "next/og";
import { PinCard, PIN_SIZE, OG_CONTENT_TYPE, ogFonts } from "@/lib/og";
import { cleanCheckInput, runCheck } from "@/lib/checkPage";
import { siteUrl } from "@/lib/siteUrl";

// The card a visitor saves.
//
// Three things about this route are deliberate and none of them are obvious
// from the outside:
//
// **It recomputes rather than being told.** The query string carries names, not
// findings. Handed a list of sentences to draw, this would be an endpoint that
// renders arbitrary text in our brand faces on our paper with no login in
// front of it — a thing you discover from a screenshot six months later.
// Everything printed here except the names themselves is something
// `analyzeName` produced.
//
// **The names are bounded at the door**, by the same function the page uses.
// See lib/nameInput.ts for what that bound honestly is and isn't.
//
// **It is `noindex`, and robots.ts deliberately does NOT disallow it.** An
// indexed one would be a page of ours about a stranger's child, and the header
// below is the whole of what prevents that. This comment used to claim the
// Disallow was a second layer — "robots stops the fetch, the header stops the
// keep" — which is exactly backwards and is the reason the line is gone.
//
// A `noindex` is only obeyed on a URL a crawler is allowed to fetch: refused
// the request, it never reads the header. And a disallowed URL that Google
// finds a link to can still be indexed *as a URL*, with no content. Here the
// sensitive part IS the URL — the name is in the query string — so a Disallow
// would hand over the one thing worth protecting and discard the only means of
// retracting it.
//
// So: if you are about to re-add `/check/card` to robots.ts, this is the note
// saying don't. `probe.ts` fails the build if you do.

/// Nothing renders it, but a bare `/check/card` should be a refusal rather
/// than a 500 out of the middle of the renderer.
function badRequest(reason: string) {
  return new Response(reason, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = cleanCheckInput({
    first: params.get("first"),
    middle: params.get("middle"),
    last: params.get("last"),
    sibling: params.get("sibling"),
  });

  if (!input.first) return badRequest("A first name is needed to draw a card.");

  const result = runCheck(input);

  // The host rather than a hard-coded domain: this string is the only thing on
  // the card telling somebody where it came from, and a card generated on a
  // preview deploy saying the production address would be pointing at a page
  // that doesn't have this result on it.
  const foot = `${new URL(siteUrl()).host}/check`;

  return new ImageResponse(
    (
      <PinCard
        name={result.fullName}
        initials={result.initials}
        findings={result.findings.map((c) => c.title)}
        foot={foot}
      />
    ),
    {
      ...PIN_SIZE,
      fonts: await ogFonts(),
      headers: {
        "Content-Type": OG_CONTENT_TYPE,
        "X-Robots-Tag": "noindex, noimageindex",
        // Long enough that Pinterest's fetch, a reload and a share all hit the
        // same render; short enough that a CDN is not holding a picture of a
        // stranger's unborn child for a year. The page promises we don't save
        // what someone types, and a year-long immutable cache entry would be
        // us saving it in the one place nobody thinks to look.
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    },
  );
}
