import { createHash, timingSafeEqual } from "node:crypto";
import { consultantConfig } from "@/lib/consultant";
import { requireAdmin } from "@/lib/admin";
import Anthropic from "@anthropic-ai/sdk";

/// Is the consultant actually able to speak right now?
///
/// The outage this exists for was invisible from outside: every page loaded,
/// the chat accepted messages, and the only symptom was an apology that reads
/// like the model being thoughtful. The cause — a model id that no longer
/// exists — was one line in a log nobody was watching.
///
/// So it can be asked directly. `GET /api/health/consultant` says whether
/// there is a key, which model is configured, and, with `?probe=1`, whether a
/// real call to it succeeds.
///
/// The unauthenticated answer is deliberately the boring half: is it up. The
/// two things that aren't free — a billed call to Anthropic, and the shape of
/// the API key — need either an admin session or `NAMESAKE_HEALTH_TOKEN`. An
/// uptime monitor can't sign in, so the token is what keeps this usable from
/// one; unset, there is no token to guess and only an admin gets through.
export async function GET(request: Request) {
  const cfg = consultantConfig();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  const trusted = await isTrusted(request, url);

  const body: Record<string, unknown> = {
    ok: cfg.hasKey,
    hasApiKey: cfg.hasKey,
    configuredModel: cfg.configured,
    modelSource: process.env.NAMESAKE_MODEL ? "NAMESAKE_MODEL" : "code default",
    fallbackLadder: cfg.ladder,
    provenModel: cfg.proven,
  };

  // Enough about the key to tell a missing one from a malformed one from a
  // merely wrong one, and never enough to be worth stealing: a length and the
  // public prefix every Anthropic key starts with. A key pasted with quotes,
  // a trailing newline, or half a value shows up here immediately. Still not
  // for strangers — a length narrows a guess, and it names our provider.
  if (trusted) {
    const raw = process.env.ANTHROPIC_API_KEY ?? "";
    body.keyShape = {
      present: Boolean(raw),
      length: raw.length,
      looksWellFormed: /^sk-ant-[A-Za-z0-9_-]+$/.test(raw),
      hasSurroundingQuotes: /^["'].*["']$/.test(raw),
      hasWhitespace: raw !== raw.trim(),
    };
  }

  if (!cfg.hasKey) {
    body.ok = false;
    body.detail = "ANTHROPIC_API_KEY is not set — the consultant cannot answer at all.";
    return json(body, 503);
  }

  if (!probe) return json(body, 200);

  // Every probe spends money on our account and a slot against our rate limit,
  // so it is not something a stranger gets to trigger in a loop.
  if (!trusted) {
    body.probe = {
      reachable: null,
      detail:
        "?probe=1 makes a real, billed call to Anthropic. Sign in as an admin, or pass the " +
        "NAMESAKE_HEALTH_TOKEN as ?token= or an Authorization: Bearer header.",
    };
    return json(body, 401);
  }

  // Smallest call that still proves the configured model is reachable by this
  // key. One token is enough — we care whether it answers, not what it says.
  try {
    const res = await new Anthropic().messages.create({
      model: cfg.configured,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    body.probe = { model: res.model, reachable: true };
    return json(body, 200);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    body.ok = false;
    body.probe = {
      reachable: false,
      status: e?.status ?? null,
      message: e?.message ?? String(err),
      // The whole point: say what to do about it, in the response.
      remedy: remedyFor(e, cfg.configured),
    };
    // 200, not 5xx: the ladder means chat is probably still working, and this
    // endpoint should describe the degradation rather than assert an outage.
    return json(body, 200);
  }
}

/// Two ways to be allowed the expensive half: the person is an admin, or the
/// caller knows the health token. The token exists because the machine that
/// most wants this endpoint — an uptime monitor — has no session to offer.
///
/// `requireAdmin` fails closed on its own: with `NAMESAKE_ADMIN_EMAILS` empty
/// it returns null for everyone. So does an unset token. A deploy that
/// configures neither is a deploy where nobody can spend the account's credit
/// from here, which is the right way round for a route that costs money.
async function isTrusted(request: Request, url: URL) {
  const expected = process.env.NAMESAKE_HEALTH_TOKEN ?? "";
  if (expected) {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const offered = bearer || url.searchParams.get("token") || "";
    if (offered && secretsMatch(offered, expected)) return true;
  }
  return Boolean(await requireAdmin());
}

/// Length-independent, content-constant comparison. `timingSafeEqual` throws on
/// a length mismatch — which would leak the token's length through the error —
/// so both sides are hashed to a fixed width first.
function secretsMatch(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

/// Turn a failure into the sentence someone can act on. Every branch here is a
/// real way this has broken or could break, and the wording is aimed at
/// whoever is looking at the dashboard at 2am, not at a stack trace.
function remedyFor(e: { status?: number; message?: string }, configured: string): string {
  const msg = e?.message ?? "";
  if (/credit balance|billing|quota/i.test(msg)) {
    return "The Anthropic account is out of credit or has a billing block. Top it up at console.anthropic.com — no code change will fix this one.";
  }
  switch (e?.status) {
    case 401:
      return "ANTHROPIC_API_KEY is present but rejected — wrong, revoked, or from another organisation. Check keyShape above, then reissue the key at console.anthropic.com and update it in Vercel for the Production environment.";
    case 403:
      return "The key is valid but not permitted to use this model. Check the key's workspace and model permissions.";
    case 404:
      return `Model "${configured}" cannot be reached by this key. Set NAMESAKE_MODEL to a current model, or unset it to use the default. Chat still works via the fallback ladder.`;
    case 429:
      return "Rate limited. Chat retries with backoff, so this is usually self-healing; if it persists, the account's limits are too low for current traffic.";
    default:
      return "The configured model did not answer. Chat will fall back to the next model on the ladder — check the message above for the underlying reason.";
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
