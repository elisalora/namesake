import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The card that arrives in someone's messages.
//
// Almost every share of this product is one person handing it to another —
// a couple asking family to chip in, a shower card, a link in a group chat.
// Until now those arrived as naked grey text, which is a poor showing for a
// gift. This is the stationery version: oyster paper, a hairline border, the
// mark, and one line.
//
// Deliberately no photograph and no baby. The whole brand is restraint — an
// engraved pewter cup, not a nursery — and a stock photo of a bump would
// undo it in one share.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Tokens, copied rather than imported: globals.css is a stylesheet the image
// renderer can't read, and these five values are the whole palette.
const PAPER = "#f5f2e9";
const LINE = "#ded8c9";
const PEWTER = "#414a45";
const PEWTER_LIGHT = "#9aa1a2";
const PEWTER_MUTE = "#6b716e";
const SAGE_DEEP = "#55654f";

/// Both faces, in the pairing the site uses: Cormorant carries the display
/// line, Jost everything else.
///
/// Loaded from the repo rather than fetched at build. A network hiccup on a
/// deploy should not silently drop the brand faces and ship a card in the
/// renderer's fallback sans, which is the one failure nobody would notice
/// until it was in somebody's messages. Licences sit beside them.
export async function ogFonts() {
  const [display, sans, sansMedium] = await Promise.all([
    readFile(join(process.cwd(), "assets/CormorantGaramond-Medium.ttf")),
    readFile(join(process.cwd(), "assets/Jost-400.ttf")),
    readFile(join(process.cwd(), "assets/Jost-500.ttf")),
  ]);
  return [
    { name: "Cormorant Garamond", data: display, style: "normal" as const, weight: 500 as const },
    { name: "Jost", data: sans, style: "normal" as const, weight: 400 as const },
    { name: "Jost", data: sansMedium, style: "normal" as const, weight: 500 as const },
  ];
}

/// The mark, inlined. `DuckMark` is a client-side component with Tailwind
/// classes and `currentColor`; the image renderer resolves neither, so the
/// paths are repeated here with the stroke stated outright. Same drawing —
/// if one changes, change both.
function Duck({ size = 132 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 48) / 64}
      viewBox="0 0 64 48"
      fill="none"
      stroke={PEWTER_LIGHT}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M45.2 22.2c-2.6 1.5-5.8 2.2-9.4 2.2H22.6c-7.9 0-14.3 4.3-14.3 9.6 0 3.4 3.1 5.6 7.7 5.6h19.4c9.6 0 17.2-6.2 17.2-13.8" />
      <path d="M8.4 31.6c-2.5-.6-4.3-1.9-5-3.4 2 .1 3.9.5 5.4 1.2" />
      <circle cx="45" cy="14" r="8.3" />
      <path d="M53.1 12.5c3.4-.5 6.2.7 6.6 2.1.4 1.4-1.9 2.9-5.2 3.3" />
      <circle cx="47.5" cy="12.3" r="1.1" fill={PEWTER_LIGHT} stroke="none" />
    </svg>
  );
}

/// `eyebrow` is the small letterspaced label the site calls "engraved";
/// `title` carries the serif. Keep `line` to roughly a dozen words — past
/// that it wraps to three lines and the card stops looking like stationery.
///
/// `titleSize` exists because the renderer lays this out in a fixed 630px
/// box and does not shrink to fit: a title long enough to wrap at 96px
/// overflows, and the overflow shows up as the hairline rule sitting on top
/// of the second line rather than as anything that fails a build. Drop it to
/// ~66 for a two-line title, and eyeball the PNG before shipping a new one.
export function OgCard({
  eyebrow,
  title,
  line,
  titleSize = 96,
}: {
  eyebrow: string;
  title: string;
  line: string;
  titleSize?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PAPER,
        padding: 40,
        fontFamily: "Jost",
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${LINE}`,
          padding: "56px 96px",
        }}
      >
        <Duck />

        <div
          style={{
            marginTop: 34,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: 4.8,
            color: PEWTER_MUTE,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>

        <div
          style={{
            marginTop: 22,
            fontFamily: "Cormorant Garamond",
            fontSize: titleSize,
            lineHeight: 1.05,
            color: PEWTER,
            textAlign: "center",
          }}
        >
          {title}
        </div>

        {/* The hairline under the title, the way the site sets a rule. */}
        <div
          style={{ marginTop: 34, width: 96, height: 1, flexShrink: 0, backgroundColor: LINE }}
        />

        <div
          style={{
            marginTop: 34,
            fontSize: 30,
            lineHeight: 1.45,
            color: SAGE_DEEP,
            textAlign: "center",
            maxWidth: 760,
          }}
        >
          {line}
        </div>
      </div>
    </div>
  );
}
