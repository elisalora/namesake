import { consultantConfig, hasApiKey } from "@/lib/consultant";
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
/// real call to it succeeds. Cheap enough to hit from an uptime monitor.
export async function GET(request: Request) {
  const cfg = consultantConfig();
  const probe = new URL(request.url).searchParams.get("probe") === "1";

  const body: Record<string, unknown> = {
    ok: cfg.hasKey,
    hasApiKey: cfg.hasKey,
    configuredModel: cfg.configured,
    fallbackLadder: cfg.ladder,
    provenModel: cfg.proven,
  };

  if (!cfg.hasKey) {
    body.ok = false;
    body.detail = "ANTHROPIC_API_KEY is not set — the consultant cannot answer at all.";
    return json(body, 503);
  }

  if (!probe) return json(body, 200);

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
      remedy:
        e?.status === 404
          ? `NAMESAKE_MODEL is set to "${cfg.configured}", which this key cannot reach. ` +
            `Set it to a current model or unset it to use the default. Chat still works via the fallback ladder.`
          : e?.status === 401
            ? "ANTHROPIC_API_KEY is present but rejected — it is wrong, revoked, or from another org."
            : "The configured model did not answer. Chat will fall back to the next model on the ladder.",
    };
    // 200, not 5xx: the ladder means chat is probably still working, and this
    // endpoint should describe the degradation rather than assert an outage.
    return json(body, 200);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
