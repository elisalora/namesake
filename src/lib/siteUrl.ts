// Where this deployment actually lives.
//
// The same three lines were written out in five places — layout, the shower
// card, the workspace page, the admin card, `originFrom` in auth.ts — each
// with its own `?.trim().replace(/\/+$/, "")`. That was survivable while every
// caller had a fallback that was merely *wrong* (an email link to the wrong
// host is a support question). It stops being survivable the moment something
// publishes the value as a fact about where the site is, which is what a
// sitemap does.

const DEV_FALLBACK = "http://localhost:3000";

function configured(): string | null {
  return process.env.NAMESAKE_URL?.trim().replace(/\/+$/, "") || null;
}

/// The origin, guessing localhost when nothing is set.
///
/// For everything whose only consequence of guessing wrong is a link that
/// doesn't work in development — `metadataBase`, previews, local runs.
export function siteUrl(): string {
  return configured() ?? DEV_FALLBACK;
}

/// The origin, refusing to guess where the guess would be published.
///
/// `robots.txt` and `sitemap.xml` are statements to a search engine about
/// which URLs exist. Unset, the fallback above would hand Google a tidy,
/// well-formed list of `http://localhost:3000/...` — a build that succeeds, a
/// file that validates, and a sitemap that is pure fiction. Nothing downstream
/// would ever complain, which is why this has to complain here.
///
/// Deliberately gated on `VERCEL` rather than on `NODE_ENV`. `next build` sets
/// NODE_ENV=production, so keying on that would refuse a local production
/// build for anyone without a `.env` — and this repo's convention for "is this
/// a real deploy" is already the one in scripts/preflight.mjs. Same gate, so
/// the two agree.
export function publicSiteUrl(): string {
  const url = configured();
  if (url) return url;
  if (process.env.VERCEL) {
    throw new Error(
      "NAMESAKE_URL is not set, so robots.txt and sitemap.xml have no origin to state. " +
        "Set it on this Vercel project — the fallback is http://localhost:3000, and a " +
        "sitemap of localhost URLs is worse than no sitemap: it builds, it validates, and " +
        "it tells Google the site does not exist.",
    );
  }
  return DEV_FALLBACK;
}
