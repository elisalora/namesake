// What may be treated as a name.
//
// This exists for one route: `/check/card`, which turns a query string into a
// PNG on our own domain, in our own faces, on our own paper, with no login in
// front of it. Whatever survives this function is what a stranger can make
// Namesake appear to have written.
//
// The bound is not a security boundary and it would be dishonest to call it
// one — letters and spaces are most of what a slogan is made of, and 60
// characters is a sentence. What it does do is remove the whole class of
// things that are obviously not names and obviously are attacks on a renderer:
// markup, control characters, right-to-left overrides, zero-width joiners,
// digits, URLs, emoji, newlines. Combined with a layout that can only ever
// look like a name card and an `X-Robots-Tag: noindex` on the response, that
// is proportionate to what the route is worth to somebody. Written down here
// rather than implied, so the next person weighing it up starts from what it
// actually promises.

export const NAME_MAX = 60;

/// Letters, the marks that go on them, and the three pieces of punctuation
/// that appear inside real names: the hyphen in Anne-Marie, the apostrophe in
/// O'Brien and D'Angelo, the stop in "St. John".
///
/// `\p{L}` and `\p{M}` rather than `[A-Za-z]`, because Ng, Okafor, Nguyen,
/// Siobhán, Zoë and José are all names and a Latin-only filter would quietly
/// mangle a subset of our own users' children. The fonts are Latin-subset, so
/// a name in a script they don't carry renders as blanks — that is a worse
/// card, not a broken one, and refusing to draw it would be the ruder answer.
const ALLOWED = /[^\p{L}\p{M}\s'’.-]/gu;

/// Reduce anything to the part of it that could be a name, or to nothing.
export function cleanNamePart(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw
    // NFC first: a combining sequence and its precomposed form should not
    // reach different lengths against the cap below.
    .normalize("NFC")
    .replace(ALLOWED, " ")
    // Any run of whitespace — including the tab and newline that `\s` covers
    // and a fixed-width layout does not — becomes one ordinary space.
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  // Punctuation and spaces on their own are not a name. Returning "" rather
  // than "'''" means every caller's existing "is this filled in" check keeps
  // working without learning about this file.
  return /\p{L}/u.test(cleaned) ? cleaned : "";
}
