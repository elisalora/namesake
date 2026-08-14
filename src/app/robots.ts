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
        // The share card. It renders whatever name is in its query string, so
        // an indexed one is a page of ours about a stranger's child. The route
        // sets `X-Robots-Tag: noindex` as well — this is the half that stops
        // it being fetched in the first place.
        "/check/card",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
