import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { siteUrl } from "@/lib/siteUrl";
import "./globals.css";

// Cormorant for display: a high-contrast old-style serif, the lettering you'd
// find engraved on a christening cup. It sets light, so headings use 500+ and
// it never carries body copy.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Jost for everything else: a geometric sans with European proportions that
// stays out of the serif's way.
const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const DESCRIPTION =
  "A private room where two people choose the name their child will carry — with an AI consultant to think it through, the people you love to draw on, and a keepsake at the end.";

export const metadata: Metadata = {
  // Absolute URLs are required for social cards, and a deployed app can't
  // derive its own origin at build time. Same variable the magic links use,
  // with the local port as the development fallback. `siteUrl` is the forgiving
  // half of that pair — see lib/siteUrl.ts for the half that refuses.
  metadataBase: new URL(siteUrl()),
  title: "Namesake — the naming of a child",
  description: DESCRIPTION,
  // Nearly every visit to this product starts with one person handing the
  // link to another. Without these the handover arrives as bare grey text,
  // and Pinterest — which needs an image to accept a pin at all — can't
  // take it. The card itself is `opengraph-image.tsx`, alongside this file.
  openGraph: {
    type: "website",
    siteName: "Namesake",
    title: "Namesake — the naming of a child",
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Namesake — the naming of a child",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Page views and the two browser-side funnel events. Off Vercel this
            renders nothing and loads no script, so local development and any
            other host are unaffected. It sends no cookie and no identifier —
            worth knowing, because this is the only third party the pages
            talk to. */}
        <Analytics />
      </body>
    </html>
  );
}
