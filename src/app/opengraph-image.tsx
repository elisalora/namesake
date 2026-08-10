import { ImageResponse } from "next/og";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, ogFonts } from "@/lib/og";

// The default card, used by every route that doesn't set its own.
export const alt = "Namesake — a private room where two people choose their child's name";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="Namesake"
        title="The naming of a child"
        line="A private room where two people choose the name their child will carry."
      />
    ),
    {
      ...size,
      fonts: await ogFonts(),
    },
  );
}
