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

/// The vertical one, for a person saving their own result.
///
/// 2:3 because that is what Pinterest lays out on; 1000×1500 because it is the
/// size their own guidance names and it is comfortably above the ~600px floor
/// under which the Save button ignores an image altogether.
///
/// Worth being precise about what this is *not*, because we got it wrong once
/// in this thread: it is not a social card. Pinterest's Save button pins an
/// image that is **on the page** — an `og:image` that only exists in `<head>`
/// is invisible to it. So this has to be rendered into the document, not just
/// pointed at from metadata, or it produces nothing on either path.
export const PIN_SIZE = { width: 1000, height: 1500 };

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
/// Held for the life of the process, not re-read per render.
///
/// The two OG routes are drawn once per share and this never mattered. The pin
/// card is different: it is public, unauthenticated, and keyed on an arbitrary
/// query string, so every distinct name is a fresh render — three file reads
/// each, of three files that cannot change without a redeploy.
///
/// Deliberately not a rate limiter and not a defence. Nothing here stops
/// somebody rendering ten thousand names; it just declines to do the same disk
/// I/O ten thousand times while they do. The proportionate answer to the bill
/// is a spend cap in the Vercel dashboard, which is not code.
let fontsPromise: ReturnType<typeof loadFonts> | null = null;

export function ogFonts() {
  // The *promise* is cached rather than the result, so N concurrent first
  // requests share one read instead of racing into three apiece.
  fontsPromise ??= loadFonts();
  return fontsPromise;
}

async function loadFonts() {
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

/* ------------------------------------------------- the one somebody saves */

/// How large the name can be set before it stops fitting.
///
/// The renderer lays this out in a fixed box and does **not** shrink to fit —
/// an overflowing title doesn't fail a build, it slides under the rule below
/// it and ships. `OgCard` solves that by making the caller pass `titleSize`
/// and eyeball the PNG; this card can't, because nobody sees it before it is
/// generated. So the size is derived from the length instead, with the steps
/// chosen against the longest real names on the SSA list set in Cormorant at
/// 840px of usable width.
function nameSize(name: string): number {
  if (name.length <= 16) return 112;
  if (name.length <= 24) return 92;
  if (name.length <= 34) return 74;
  return 58;
}

/// How many findings fit before the card stops being a card.
const MAX_LINES = 4;

/// The result card: one name, its monogram, and what we found.
///
/// The empty state is the one most people get — roughly seven cards in ten come
/// back with nothing — so it is the version that has to look best, and the
/// findings list is the variant.
///
/// It used to fill that slot with "Nothing to flag." set large, and that was
/// wrong twice over. It is the same sentence `analyzeName` was cleared of in
/// be1150b — an absence of a finding is not a finding — reintroduced one level
/// up, on the surface with the widest reach in the product. And it is not a
/// thing anybody saves: the card is the Pinterest asset, its whole job is to be
/// worth pinning, and on seven cards in ten it would have been three words
/// saying we had nothing to say.
///
/// So the empty card carries no sentence at all. The name, the monogram and the
/// closing rule are a name plate, which is a keepsake and is what people
/// actually pin. The page keeps its "nothing to flag" headline and is right to:
/// it has room for the two paragraphs that follow, and those paragraphs — the
/// harder questions a checker can't answer — are the argument. The card gets
/// neither the room nor the argument, so it should not borrow the reassurance
/// they pay for.
export function PinCard({
  name,
  initials,
  findings,
  foot,
}: {
  name: string;
  initials: string;
  /// Check titles only, in the order `analyzeName` produced them. Never the
  /// detail sentences: they carry the name inline and run to three lines each,
  /// which is a paragraph, which is not a thing anybody saves.
  findings: string[];
  foot: string;
}) {
  const shown = findings.slice(0, MAX_LINES);
  const hidden = findings.length - shown.length;

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
        padding: 44,
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
          padding: "72px 80px",
        }}
      >
        <Duck size={116} />

        <div
          style={{
            marginTop: 56,
            fontFamily: "Cormorant Garamond",
            fontSize: nameSize(name),
            lineHeight: 1.06,
            color: PEWTER,
            textAlign: "center",
          }}
        >
          {name}
        </div>

        {/* The monogram, set the way the site sets its small caps. Only ever
            drawn when there are two initials to draw — a single letter is not
            a monogram, it's the first letter of a first name. */}
        {initials.length >= 2 && (
          <div
            style={{
              marginTop: 34,
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: 12,
              color: PEWTER_MUTE,
            }}
          >
            {initials}
          </div>
        )}

        <div
          style={{ marginTop: 54, width: 120, height: 1, flexShrink: 0, backgroundColor: LINE }}
        />

        {shown.length === 0 ? null : (
          <div
            style={{
              marginTop: 48,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Spacing by margin rather than `gap`: Satori's flex support is a
                subset, and a property it silently ignores here would show up
                as a cramped card in somebody's feed rather than as an error. */}
            {shown.map((line, i) => (
              <div
                key={line}
                style={{
                  marginTop: i === 0 ? 0 : 22,
                  fontSize: 34,
                  lineHeight: 1.3,
                  color: SAGE_DEEP,
                  textAlign: "center",
                  maxWidth: 700,
                }}
              >
                {line}
              </div>
            ))}
            {/* Never a silent truncation. A card that quietly showed four of
                six findings would read as "these are the findings". */}
            {hidden > 0 && (
              <div style={{ marginTop: 22, fontSize: 26, color: PEWTER_LIGHT }}>
                and {hidden} more on the page
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 26,
          fontSize: 24,
          letterSpacing: 2.4,
          color: PEWTER_LIGHT,
          textTransform: "uppercase",
        }}
      >
        {foot}
      </div>
    </div>
  );
}
