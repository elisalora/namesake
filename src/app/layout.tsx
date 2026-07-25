import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Namesake — the naming of a child",
  description:
    "A private room where two people choose the name their child will carry — with an AI consultant to think it through, the people you love to draw on, and a keepsake at the end.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
