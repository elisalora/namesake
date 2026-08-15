// Gentle, deterministic checks on a full name.
// The goal is never to veto — only to surface things worth a glance,
// framed kindly, so the parents notice before the grandparents do.

export type CheckLevel = "delight" | "info" | "watch";

export type NameCheck = {
  level: CheckLevel;
  title: string;
  detail: string;
  /// True when this is about how the name sits beside a sibling's, rather than
  /// about the name itself — so the decision screen can repeat just those.
  pair?: boolean;
};

// Short letter-combos that tend to invite teasing on a monogram / initials.
const UNFORTUNATE_INITIALS = new Set([
  "ASS", "ASH", "BJ", "BM", "BO", "BS", "BUM", "CS", "DIE", "DUI", "FU", "FML",
  "GAS", "HIV", "KKK", "LSD", "OMG", "PMS", "POO", "POS", "PEE", "RAT", "SOB",
  "SOS", "STD", "SUX", "UGH", "VD", "WTF", "ZIT", "DUD", "HAG", "PIG", "GIT",
]);

// Short combos that happen to spell something lovely.
const DELIGHTFUL_INITIALS = new Set([
  "ACE", "ART", "FAB", "JOY", "POP", "SKY", "WOW", "ELF", "GEM", "SUN", "OWL",
  "CAT", "FOX", "IVY", "ZEN", "WIN", "TOP", "HUG", "AMP", "KEY", "MAP",
]);

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function initialsOf(parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p) => p.trim()[0]?.toUpperCase() ?? "")
    .join("");
}

// Very rough end-rhyme: do two words share their last 2+ letters but differ?
function endRhyme(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  for (const n of [3, 2]) {
    if (x.length >= n && y.length >= n && x.slice(-n) === y.slice(-n)) return true;
  }
  return false;
}

// `VOWELS` used to live here, holding a, e, i, o, u *and y*, and it was the
// whole of the flow rule's phonetics. Its last caller is gone. Anything that
// wants to reason about a vowel now has to say which vowel and in what
// position, because that turned out to be the entire question.

/// The sound an initial letter makes, as far as spelling can honestly tell.
///
/// C and G are the two English initials that go two ways, and the rule for
/// them is regular: soft before e, i and y. Cynthia opens on /s/ and Carter on
/// /k/; George on /dʒ/ and Garcia on /g/. Every other letter is taken at face
/// value.
///
/// This is a heuristic and not a pronunciation dictionary. It is here because
/// the alliteration check is a *claim*, made in our own voice, on the line a
/// stranger reads first — and against a surname like Garcia nearly half of the
/// names it fired on did not alliterate at all. It fixes the two cases that
/// regularly collide on a name card and claims nothing beyond them.
function initialSound(name: string): string {
  const s = name.toLowerCase();
  if (s.startsWith("c")) return /^c[eiy]/.test(s) ? "s" : "k";
  if (s.startsWith("g")) return /^g[eiy]/.test(s) ? "j" : "g";
  return s[0];
}

export type NamePieces = {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
};

/// A name already chosen for one of the other babies in this journey, and what
/// that baby is called while we wait for it. Only ever set for twins and
/// triplets — a single baby has nobody to be compared with.
export type Sibling = NamePieces & { label: string };

export function analyzeName(
  { firstName, middleName, lastName }: NamePieces,
  /// Names already spoken for. Once one twin is named, every remaining name is
  /// really being judged as half of a pair, so the pair gets checked too.
  siblings: Sibling[] = [],
): NameCheck[] {
  const checks: NameCheck[] = [];
  const first = (firstName || "").trim();
  const middle = (middleName || "").trim();
  const last = (lastName || "").trim();
  if (!first) return checks;

  // --- Monogram / initials ---
  const parts = [first, middle, last].filter(Boolean);
  const initials = initialsOf(parts);
  if (initials.length >= 2) {
    if (UNFORTUNATE_INITIALS.has(initials)) {
      checks.push({
        level: "watch",
        title: `The initials spell "${initials}"`,
        detail: `Written out — on a backpack, a monogrammed towel, a school locker — the initials read ${initials}. Some parents nudge the middle name to soften this; others don't mind at all.`,
      });
    } else if (DELIGHTFUL_INITIALS.has(initials)) {
      checks.push({
        level: "delight",
        title: `The initials spell "${cap(initials)}"`,
        detail: `A little hidden gift: the monogram reads ${cap(initials)}. Lovely on a keepsake.`,
      });
    }
    // No third branch on purpose. A monogram with nothing wrong with it is not
    // a finding, and saying so out loud was the single most-read sentence in
    // the product — see the note at the foot of this file.
  }

  if (!last) {
    checks.push({
      level: "info",
      title: "Add your surname for the full picture",
      detail: "Set your family surname in the workspace and I'll also check how the whole name flows and what it monograms to.",
    });
    return [...checks, ...siblingChecks({ firstName: first, middleName: middle }, siblings)];
  }

  // --- First + surname flow ---
  if (endRhyme(first, last)) {
    checks.push({
      level: "watch",
      title: "First name and surname rhyme",
      detail: `"${first} ${last}" has a sing-song rhyme. Charming to some, a touch nursery-rhyme to others — say it aloud a few times and see how it sits.`,
    });
  }

  // Run-on: the first name's last letter equals the surname's first letter.
  const fEnd = first.slice(-1).toLowerCase();
  const lStart = last[0].toLowerCase();
  if (fEnd === lStart) {
    checks.push({
      level: "info",
      title: "Two matching sounds meet in the middle",
      detail: `"${first} ${last}" runs the ${fEnd.toUpperCase()} of one name straight into the next — it can blur when spoken quickly (say it fast and listen).`,
    });
  }

  // Alliteration is usually a plus. Compared on the sound the initial makes
  // rather than the letter — "George Garcia" and "Cynthia Carter" match on
  // paper and on nothing else, and this check is the one a stranger is most
  // likely to see, so it is the one least able to afford being visibly wrong.
  if (initialSound(first) === initialSound(last) && fEnd !== lStart) {
    checks.push({
      level: "delight",
      title: "Nice alliteration",
      detail: `"${first} ${last}" shares an opening sound — the kind of name that's satisfying to say.`,
    });
  }

  // Two names with no consonant between them.
  //
  // English does not leave two vowels touching: it inserts a glide, and which
  // glide is decided by how the first vowel ends. A front/high finish (-y, -i,
  // -ie, -ee, -ey) takes a /j/ — "Emily Ellis" is *Emily-yellis*. A back or
  // rounded one (-o, -u, -ew) takes a /w/ — "Theo Ellis" is *Theo-wellis*.
  // Neither blurs. A final schwa is the case with no glide available, so -a
  // and -ah are the only endings that actually fuse.
  //
  // That is why this reads the ending rather than asking `VOWELS`, and it
  // fixes the rule in both directions: -ah names end on a schwa and are the
  // strongest cases there are, and the old test was silent on all 67 of them
  // because `h` is not a vowel letter. On the surname side `y` is excluded
  // outright — y- is /j/, a consonant, and `VOWELS` containing "y" meant every
  // Yamamoto and Young family got this line on half their shortlist.
  //
  // Known limit, not worth chasing: -ea is /i/ and does take a glide, so
  // Chelsea, Lea and Shea are three false fires out of 455. (Andrea is a
  // genuine schwa.)
  const schwaEnding = /(a|ah)$/i.test(first);
  if (schwaEnding && /^[aeiou]/i.test(last)) {
    // Only illustrated for a plain -a, where eliding the vowel gives a word
    // that is actually right. "Hannah" + "Osei" has no such clean form, and a
    // made-up one would be the exact failure this check is being fixed for.
    const fused = /a$/i.test(first) ? ` — *${first.slice(0, -1)}${last.toLowerCase()}*` : "";
    checks.push({
      level: "info",
      title: "Nothing between the names",
      detail: `"${first} ${last}" ends on an open vowel and begins again on one, with no consonant in between. Said quickly it can land as a single word${fused}. Worth hearing someone else say it before you decide.`,
    });
  }

  // --- The middle name, in its place ---
  //
  // A middle name is only ever heard between two others, so the only useful
  // things to say about it are about the joins either side.
  if (middle) {
    const mStart = middle[0].toLowerCase();
    const mEnd = middle.slice(-1).toLowerCase();
    if (endRhyme(middle, first) || endRhyme(middle, last)) {
      checks.push({
        level: "watch",
        title: `${middle} rhymes with ${endRhyme(middle, first) ? first : last}`,
        detail: `Said in full — "${first} ${middle} ${last}" — two of the three names chime. Middle names are usually said out loud only when someone's in trouble, so it matters less than it looks. Worth hearing once.`,
      });
    } else if (fEnd === mStart || mEnd === lStart) {
      checks.push({
        level: "info",
        title: "The middle name runs into its neighbour",
        detail: `"${first} ${middle} ${last}" butts two matching sounds together. It usually smooths out in speech — say it once, quickly, and see.`,
      });
    }
    // Again no third branch: three names that don't collide is the ordinary
    // case, and it fired on 85% of full names.
  }

  // --- Full-name length ---
  const full = [first, middle, last].filter(Boolean).join(" ");
  if (full.length >= 24) {
    checks.push({
      level: "info",
      title: "A long full name to write out",
      detail: `"${full}" is on the longer side — think tiny forms, name tags, and a small hand learning to sign it. No problem, just a heads-up.`,
    });
  }

  return [...checks, ...siblingChecks({ firstName: first, middleName: middle, lastName: last }, siblings)];
}

/* ------------------------------------------------ how a pair sits together */

// Are two names near-twins themselves? Either a letter apart, or sharing
// enough of a beginning that a teacher will say the wrong one for a year.
function nearlyTheSame(a: string, b: string): boolean {
  if (editDistance(a, b) <= 1) return true;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return shared >= 3 && Math.abs(a.length - b.length) <= 2;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/// How a name sounds beside the ones their brother or sister already has.
///
/// The same spirit as the monogram check, and for the same reason: twins are
/// called across a room together for eighteen years, so the pair is a real
/// thing to look at and not a detail. Never a verdict — a rhyming pair is a
/// delight to plenty of families. It should just be on purpose.
function siblingChecks(name: NamePieces, siblings: Sibling[]): NameCheck[] {
  const checks: NameCheck[] = [];
  const first = (name.firstName || "").trim();
  if (!first) return checks;

  for (const sib of siblings) {
    const other = (sib.firstName || "").trim();
    if (!other) continue;
    const a = first.toLowerCase();
    const b = other.toLowerCase();
    const pair = `${other} and ${first}`;

    if (a === b) {
      checks.push({
        pair: true,
        level: "watch",
        title: `That's ${sib.label}'s name`,
        detail: `${sib.label} is already ${other}. Two children with one name between them is a lot to carry — unless you mean it as a middle name for both.`,
      });
      continue;
    }

    if (endRhyme(first, other)) {
      checks.push({
        pair: true,
        level: "watch",
        title: `${pair} rhyme`,
        detail: `Said together — and they will be said together, constantly — "${pair}" rhymes. Some families adore that; others find it hard to shake. Worth calling them both out loud across a room before you decide.`,
      });
    } else if (nearlyTheSame(a, b)) {
      checks.push({
        pair: true,
        level: "watch",
        title: `${pair} are easy to muddle`,
        detail: `"${other}" and "${first}" are close enough that teachers, relatives, and eventually the two of them will mix them up. Lovely on paper, tiring at the school gate.`,
      });
    } else if (a[0] === b[0]) {
      checks.push({
        pair: true,
        level: "info",
        title: `Both begin with ${a[0].toUpperCase()}`,
        detail: `${pair} share an initial. Plenty of families love a matched set; others find it a lifetime of opened post. Either is fine — as long as it's a choice.`,
      });
    }
    // And none here. A pair that sits fine together needs no sentence.

    // Independent of how they sound: two children who monogram to the same
    // three letters share every towel, satchel, and engraved cup they own.
    const mine = initialsOf([first, name.middleName ?? "", name.lastName ?? ""]);
    const theirs = initialsOf([other, sib.middleName ?? "", sib.lastName ?? ""]);
    if (mine.length >= 2 && mine === theirs) {
      checks.push({
        pair: true,
        level: "watch",
        title: `They'd share the monogram ${mine}`,
        detail: `${pair} would both initial to ${mine} — one set of letters on two of everything. Changing one middle name is usually all it takes, if that matters to you.`,
      });
    }
  }

  return checks;
}

// A single one-line headline for a name, for compact list views.
//
// The one place this rule is written down. It existed twice — here, and again
// inside NameCard — with different fallbacks, and the copy nobody had chosen
// was the one on screen. If a second caller ever needs a different rule, give
// it an argument; do not write the `find` chain out again.
//
// The fallback is `checks[0]` rather than null on purpose. Every check this
// function can now be handed is a finding — the three branches that fired to
// say *nothing is wrong* are gone — so falling through to the first one shows
// a true `info` line ("Two matching sounds meet in the middle", "A long full
// name to write out") instead of dropping the whole tier off the card.
export function checkHeadline(checks: NameCheck[]): NameCheck | null {
  return (
    checks.find((c) => c.level === "watch") ??
    checks.find((c) => c.level === "delight") ??
    checks[0] ??
    null
  );
}
