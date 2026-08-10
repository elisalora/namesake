import { ImageResponse } from "next/og";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, ogFonts } from "@/lib/og";

// `/gift` gets its own card because it is the most-shared URL in the product
// and the person receiving the link is a would-be giver, not a parent. The
// default card sells the room; this one sells the handover.
export const alt = "A Namesake journey, given as a gift";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="A gift"
        title="A name is the first thing they'll give their child"
        line="Help them choose it — a private room for the two of them, and the story of the name at the end."
        titleSize={66}
      />
    ),
    {
      ...size,
      fonts: await ogFonts(),
    },
  );
}
