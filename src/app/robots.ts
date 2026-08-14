import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/siteUrl";

// There was no robots.txt at all, which is not the neutral position people
// assume it is: with nothing here every URL this app serves is fair game,
// including the ones that are only private because they are unguessable.
//
// Two rules, and the first one is the one that matters.

export default function robots(): MetadataRoute.Robots {
  const base = publicSiteUrl();

  // A Vercel preview is a real, public, crawlable URL on a domain we do not
  // control the reputation of, serving the same pages as production. Indexed,
  // it competes with the site it is a preview of. `VERCEL_ENV` is "production"
  // only on the production deployment, so this covers previews and any future
  // environment without needing to be told about it.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/dev/",
        // Everything below is somebody's private room, reachable by a link
        // they were given. Unguessable is not the same as unlisted, and a
        // crawler that meets one of these URLs anywhere — a pasted link in a
        // public forum, a browser extension, a referrer header — will fetch it
        // and may keep it.
        "/w/",
        "/s/",
        "/join/",
        "/redeem/",
        "/auth/",
        "/journeys",
        // `/check/card` is deliberately NOT in this list, and the reason is the
        // opposite of the obvious one.
        //
        // It renders whatever name is in its query string, so an indexed one
        // would be a page of ours about a stranger's child — and the first
        // version of this file disallowed it for exactly that reason. That was
        // backwards. Google is explicit: a `noindex` is only obeyed if the URL
        // can be crawled, because a crawler that is refused the fetch never
        // reads the header. A disallowed URL that Google finds a link to can
        // still be indexed *as a URL*, without content.
        //
        // For this route the sensitive part IS the URL — the child's name is in
        // the query string. So a Disallow buys the worst outcome available:
        // Google may list `/check/card?first=…&last=…` as a bare result and can
        // never be told to drop it. Allowing the fetch means it reads
        // `X-Robots-Tag: noindex, noimageindex` and keeps nothing.
        //
        // The discovery path is not hypothetical: a pin links the card, which
        // is precisely how a crawler would meet one of these URLs.
        //
        // It also means Pinterestbot — which respects robots.txt, and is the
        // one crawler this route exists to serve — is no longer told to stay
        // away from the image the page asks people to save.
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
