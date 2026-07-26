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

const strict = Boolean(process.env.VERCEL) || process.env.NAMESAKE_STRICT_PREFLIGHT === "1";

const fatal = [];
const warn = [];

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

for (const w of warn) console.warn(`\n  ⚠  ${w}`);
for (const f of fatal) console.error(`\n  ✖  ${f}`);

if (fatal.length && strict) {
  console.error(
    `\n  Refusing to build: ${fatal.length} setting(s) above would leave the deployed ` +
      `site broken in ways that look fine from the outside.\n` +
      `  Set them in Vercel under Settings → Environment Variables, then redeploy.\n`,
  );
  process.exit(1);
}

if (fatal.length) {
  console.warn(
    `\n  ${fatal.length} setting(s) above would break a real deploy. Continuing because ` +
      `this is a local build.\n`,
  );
} else if (!warn.length) {
  console.log("\n  Preflight: all clear.\n");
}
