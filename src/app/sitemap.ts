import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/siteUrl";

// Every page a stranger is allowed to arrive on, listed once.
//
// Written out by hand rather than discovered from the route tree, because the
// route tree is mostly private: `/w/[id]`, `/join/[token]`, `/s/[slug]` and
// `/redeem/[code]` are all pages, and a generated sitemap would have to be
// told to leave them out anyway. A list you can read is the safer shape when
// the failure mode is publishing somebody's private URL.
//
// `/journeys` and `/signin` are deliberately absent: one redirects unless
// you're signed in, and the other is a form. Neither is an answer to anything
// somebody searched for.
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "monthly" },
  // Second only to the storefront on purpose. It is the one page here a
  // stranger can get an answer out of without giving us anything.
  { path: "/check", priority: 0.9, changeFrequency: "monthly" },
  { path: "/gift", priority: 0.7, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
  { path: "/refunds", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteUrl();
  return PAGES.map((page) => ({
    url: `${base}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
