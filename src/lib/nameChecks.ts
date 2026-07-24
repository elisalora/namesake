// Gentle, deterministic checks on a full name.
// The goal is never to veto — only to surface things worth a glance,
// framed kindly, so the parents notice before the grandparents do.

export type CheckLevel = "delight" | "info" | "watch";

export type NameCheck = {
  level: CheckLevel;
  title: string;
  detail: string;
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

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

export type NamePieces = {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
};

export function analyzeName({ firstName, middleName, lastName }: NamePieces): NameCheck[] {
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
    } else {
      checks.push({
        level: "info",
        title: `Monogram: ${initials}`,
        detail: `The initials read ${initials} — nothing awkward there.`,
      });
    }
  }

  if (!last) {
    checks.push({
      level: "info",
      title: "Add your surname for the full picture",
      detail: "Set your family surname in the workspace and I'll also check how the whole name flows and what it monograms to.",
    });
    return checks;
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

  // Alliteration is usually a plus.
  if (first[0].toLowerCase() === lStart && fEnd !== lStart) {
    checks.push({
      level: "delight",
      title: "Nice alliteration",
      detail: `"${first} ${last}" shares an opening sound — the kind of name that's satisfying to say.`,
    });
  }

  // Trailing/leading vowel pileup (e.g. "Mia Ainsworth" → "Miaainsworth").
  if (VOWELS.has(fEnd) && VOWELS.has(lStart)) {
    checks.push({
      level: "info",
      title: "Vowels meet between the names",
      detail: `"${first} ${last}" ends and begins on vowels, which can slur together. Often totally fine — just worth hearing out loud.`,
    });
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

  return checks;
}

// A single one-line headline for a name, for compact list views.
export function checkHeadline(checks: NameCheck[]): NameCheck | null {
  return (
    checks.find((c) => c.level === "watch") ??
    checks.find((c) => c.level === "delight") ??
    null
  );
}
