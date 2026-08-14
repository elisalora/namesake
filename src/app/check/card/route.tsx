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
// **It is `noindex`, and robots.ts disallows it.** An indexed one would be a
// page of ours about a stranger's child. Two layers because they fail
// differently: robots stops the fetch, the header stops the keep.

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
