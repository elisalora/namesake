// What has to be true before strangers can use this.
//
// Namesake degrades gracefully by design: no Anthropic key means mock replies,
// no Stripe key means a simulated checkout, no Resend key means links printed
// to the console. That's what keeps it walkable with an empty .env — and it is
// exactly what makes a half-configured deploy dangerous, because every one of
// those fallbacks looks like a working app until you inspect it closely.
//
// So: report everything, and refuse the build only for the settings that make a
// deployed site quietly non-functional. Locally this is advice; on Vercel it is
// a gate.

// This runs as its own process before `next build`, so Next hasn't loaded .env
// for us. On Vercel there is no .env and this quietly does nothing — the real
// values come from the environment.
import "dotenv/config";
import { readFileSync } from "node:fs";

const strict = Boolean(process.env.VERCEL) || process.env.NAMESAKE_STRICT_PREFLIGHT === "1";

// Narrower than `strict`, for the one check below that is about what a
// *customer* reads rather than about whether the app can function.
//
// A preview deploy has no customers. Blocking one would mean nobody could
// click through a branch to look at the very copy in question, which is the
// opposite of useful. Production is where somebody can be told two different
// things, so production is where this refuses.
const customerFacing =
  process.env.VERCEL_ENV === "production" || process.env.NAMESAKE_STRICT_PREFLIGHT === "1";

const fatal = [];
const warn = [];
/// Problems that only matter once real people are reading the pages.
const customerFatal = [];

const has = (name) => Boolean(process.env[name]?.trim());

/* ------------------------------------------------------------ sign-in */

// There are no passwords here. Without a mail provider nobody but whoever can
// read the server log is able to get in — including you.
if (!has("RESEND_API_KEY")) {
  fatal.push(
    "RESEND_API_KEY is not set. Sign-in is by emailed magic link only, so without it " +
      "nobody can log in — the link would go to the server log and nowhere else.",
  );
}

const from = process.env.NAMESAKE_FROM_EMAIL?.trim();
if (!from) {
  warn.push(
    "NAMESAKE_FROM_EMAIL is not set, so mail goes out as onboarding@resend.dev. " +
      "Resend's shared onboarding address will only deliver to your own account " +
      "address — friends you send a code to would never receive it. Set a from-address " +
      "on your verified domain.",
  );
} else if (/@resend\.dev/i.test(from)) {
  warn.push(
    `NAMESAKE_FROM_EMAIL is "${from}", which is Resend's shared testing domain and ` +
      "only delivers to your own account address. Use your verified domain instead.",
  );
}

if (!has("NAMESAKE_URL")) {
  warn.push(
    "NAMESAKE_URL is not set. Links in emails fall back to the request origin, which " +
      "is usually right on Vercel but wrong behind a proxy or a custom domain.",
  );
}

/* ------------------------------------------------------------ payments */

// A key with no signing secret isn't half-configured, it's broken: the webhook
// is the only thing that grants access, and it refuses what it can't verify.
if (has("STRIPE_SECRET_KEY") && !has("STRIPE_WEBHOOK_SECRET")) {
  fatal.push(
    "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not. The webhook is the only " +
      "thing that grants access after payment, and it rejects anything it can't verify — " +
      "so people would be charged and receive nothing.",
  );
}

if (!has("STRIPE_SECRET_KEY")) {
  warn.push(
    "STRIPE_SECRET_KEY is not set, so nothing can be bought. Fine if you're handing out " +
      "free codes from /admin/codes; not fine if you expected to take money.",
  );
}

/* ------------------------------------------------- the refund promise */

// The one check here that isn't about a setting.
//
// The refund term is written out in prose on four surfaces — /refunds, the FAQ
// answer, GiftForm and RefundNote — and nothing made them agree. That is not a
// hypothetical failure: five live surfaces promised fourteen days against a
// thirty-day policy for twelve days, and it was caught only because somebody
// went looking. A customer reading two different numbers on the same site is
// exactly this file's remit: broken in a way that looks fine from the outside.
//
// **This is the weaker of the two checks and it is here for one reason: it is
// the one that runs.** `npm run probe` reads the *rendered* pages, which is
// the truer question — a string that never reaches a screen is not a promise —
// but it needs a running server, so it can never run inside a build. This one
// reads source, catches the same disagreement, and sits in the only place that
// can actually refuse a deploy.
//
// No network, no server, nothing external. It fails only when the repository
// genuinely contradicts itself, and it names the file and the word when it
// does.
const REFUND_SURFACES = [
  "src/app/refunds/page.tsx",
  "src/app/faq/page.tsx",
  "src/components/GiftForm.tsx",
  "src/components/RefundNote.tsx",
];

// Spellings mapped to the window they mean, rather than a list of words
// compared to each other.
//
// "thirty" and "30 days" are one promise written two ways. Comparing the words
// would refuse a production build for a numeral — naming two files and saying
// they disagree when they say the same thing, to whoever is mid-deploy. The
// check would be asserting typographic uniformity and reporting it as a
// contradiction.
const REFUND_TERMS = {
  fourteen: 14,
  "14 days": 14,
  thirty: 30,
  "30 days": 30,
  sixty: 60,
  "60 days": 60,
};

// Case-insensitive, and that is not fussiness. The sibling check in
// scripts/probe.ts was case-sensitive in its first draft and silently skipped
// the FAQ entirely, because that answer opens the sentence — "Fourteen days
// from purchase". A check that quietly covers one fewer surface than it claims
// to is worse than no check.
const stated = new Map(); // file -> Set of windows it names
const missingFiles = [];
for (const file of REFUND_SURFACES) {
  let text;
  try {
    text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  } catch {
    missingFiles.push(file);
    continue;
  }
  // Comments are not copy, and reading them as copy is a false positive
  // waiting to happen. `RefundNote.tsx` explains itself in a doc comment that
  // says "promised thirty days" — so a version of this that scanned the whole
  // file would have found a window on that surface even after the visible
  // sentence stopped stating one, and would refuse a production build the day
  // somebody wrote "we used to say fourteen" above a line saying thirty.
  //
  // Block comments and whole-line `//` or `*` comments only. Deliberately not
  // clever: it must never eat the inside of a string, and `https://` on a code
  // line is exactly what a greedier version would swallow.
  text = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n")
    .toLowerCase();
  const windows = new Set();
  for (const [term, days] of Object.entries(REFUND_TERMS)) {
    if (text.includes(term)) windows.add(days);
  }
  stated.set(file, windows);
}

if (missingFiles.length) {
  customerFatal.push(
    `The refund-term check can't find ${missingFiles.join(", ")}. Those surfaces are ` +
      `unchecked until REFUND_SURFACES in scripts/preflight.mjs is updated — so this check ` +
      `is currently asserting less than it claims to.`,
  );
}

// Two failures, and the second is the one that would otherwise pass.
//
// A surface naming *no* recognised window is not silence, it is a blind spot:
// either the policy moved to a number this list doesn't know, or that surface
// stopped making the promise. Both mean the guard has stopped guarding it —
// and a partial edit is exactly how the fourteen-day version happened. Asking
// only whether the windows found agree would let three files quietly say
// something unrecognised while the fourth kept the old number and the check
// stayed green.
const silent = [...stated].filter(([, windows]) => windows.size === 0).map(([file]) => file);
if (silent.length) {
  customerFatal.push(
    `No recognised refund window on ${silent.join(", ")}. Either the policy changed to a ` +
      `number REFUND_TERMS doesn't know — add it — or those surfaces stopped stating one. ` +
      `Until that's resolved this check is not covering them.`,
  );
}

const windows = new Set([...stated.values()].flatMap((w) => [...w]));
if (windows.size > 1) {
  const detail = [...stated]
    .filter(([, w]) => w.size)
    .map(([file, w]) => `${file} says ${[...w].join(" and ")}`)
    .join("; ");
  customerFatal.push(
    `The refund window is stated as ${[...windows].sort((a, b) => a - b).join(" and ")} days ` +
      `in different places: ${detail}. Whichever is right, a customer can currently read ` +
      `both — the page they're promised one thing on and the button they're promised ` +
      `another under. Make them agree.`,
  );
}

/* ------------------------------------------------------------ the rest */

if (!has("NAMESAKE_ADMIN_EMAILS")) {
  warn.push(
    "NAMESAKE_ADMIN_EMAILS is empty, which means nobody can reach /admin — including " +
      "the page that mints free codes.",
  );
}

if (!has("ANTHROPIC_API_KEY")) {
  warn.push(
    "ANTHROPIC_API_KEY is not set. The consultant will answer with canned mock replies, " +
      "which is the one part of the product people are here for.",
  );
}

/* ------------------------------------------------------------ report */

// In production these are refusals like any other. Anywhere else they are the
// loudest kind of warning, because the thing they describe is real either way
// — it just hasn't reached anybody yet.
if (customerFacing) fatal.push(...customerFatal);
else for (const c of customerFatal) warn.push(`${c} (This will refuse a production build.)`);

for (const w of warn) console.warn(`\n  ⚠  ${w}`);
for (const f of fatal) console.error(`\n  ✖  ${f}`);

if (fatal.length && strict) {
  console.error(
    `\n  Refusing to build: ${fatal.length} problem(s) above would leave the deployed ` +
      `site broken in ways that look fine from the outside.\n` +
      `  Settings live in Vercel under Settings → Environment Variables; anything else ` +
      `above is in the code.\n`,
  );
  process.exit(1);
}

if (fatal.length) {
  console.warn(
    `\n  ${fatal.length} problem(s) above would break a real deploy. Continuing because ` +
      `this is a local build.\n`,
  );
} else if (!warn.length) {
  console.log("\n  Preflight: all clear.\n");
}
