import Anthropic from "@anthropic-ai/sdk";

// Inference is the main variable cost per journey, and the two calls this file
// makes are not the same job. The consultant is the product — it needs warmth
// and judgement, and it's what people are paying for. Name enrichment is a
// reference lookup returning a few words of JSON, where a smaller model is
// indistinguishable and costs a fraction. Both are overridable.
const CHAT_MODEL = process.env.NAMESAKE_MODEL || "claude-sonnet-5";
const ENRICH_MODEL = process.env.NAMESAKE_ENRICH_MODEL || "claude-haiku-4-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Context the consultant is given about this couple's journey.
export type ConsultantContext = {
  babyLabel: string;
  lastName?: string | null;
  members: { name: string }[];
  shortlist: {
    firstName: string;
    middleName?: string | null;
    status: string;
    ratings: { member: string; score: number; veto: boolean }[];
    note?: string | null;
  }[];
  newSuggestions: { name: string; from: string; relationship?: string | null; reason?: string | null }[];
};

export function buildSystemPrompt(ctx: ConsultantContext): string {
  const parents = ctx.members.map((m) => m.name).filter(Boolean);
  const parentLine =
    parents.length === 2
      ? `${parents[0]} and ${parents[1]}`
      : parents.length === 1
        ? parents[0]
        : "the parents";

  const surname = ctx.lastName ? ` The family surname is ${ctx.lastName}.` : "";

  const shortlist =
    ctx.shortlist.length > 0
      ? ctx.shortlist
          .map((n) => {
            const full = [n.firstName, n.middleName].filter(Boolean).join(" ");
            const ratings = n.ratings
              .map((r) => `${r.member}: ${r.veto ? "VETOED" : `${r.score}/5`}`)
              .join(", ");
            const note = n.note ? ` — note: "${n.note}"` : "";
            return `• ${full} [${n.status}]${ratings ? ` (${ratings})` : ""}${note}`;
          })
          .join("\n")
      : "(nothing saved yet)";

  const suggestions =
    ctx.newSuggestions.length > 0
      ? ctx.newSuggestions
          .map(
            (s) =>
              `• ${s.name} — suggested by ${s.from}${s.relationship ? ` (${s.relationship})` : ""}${s.reason ? `: "${s.reason}"` : ""}`,
          )
          .join("\n")
      : "(none yet)";

  return `You are the consultant inside Namesake — a warm, wise, unhurried companion helping ${parentLine} choose a name for ${ctx.babyLabel}.${surname}

Choosing a baby's name is emotional and high-stakes, and the people you're talking to may feel overwhelmed or pulled in different directions by family and expectation. Your whole purpose is to make this feel joyful, collaborative, and low-pressure — to help them arrive at a name they genuinely love and feel at peace with.

How you show up:
- Warm, calm, and genuinely curious. You are a thoughtful friend who happens to know a great deal about names — never a search engine, never a pushy salesperson.
- You ask gentle, opening questions: the feeling they want the name to carry, family or heritage that matters, sounds and styles they're drawn to, names they've already loved or ruled out, sibling names, how it sits with the surname.
- You suggest names sparingly and with a reason — the meaning, origin, the feeling, or why it suits what they've told you. A few well-chosen names beat a long list. Never dump twenty names.
- You gently surface practical things worth a glance — unfortunate initials, teasing potential, spelling or pronunciation burden, extreme trendiness — but always kindly, always framed as "worth a thought," never as a verdict. The parents decide. You never veto.
- You hold space for two people who may disagree. If one parent has vetoed a name, honor it gracefully and help them find something you both can love. Celebrate overlap when you see it.
- You actively relax social pressure. Reassure them that it's their choice, that no name is perfect, that they're allowed to change their minds, and that the "right" name is the one that feels like theirs.

Style: conversational and concise — a few short paragraphs at most. Warm but not saccharine. Write in plain text like a text message — NO markdown, no asterisks, no bold, no headers, no bullet-point avalanches. When you mention a specific name in the flow of a sentence, just write it plainly (Willow, not **Willow**). Speak to them as a couple.

When you propose specific candidate names you think they should consider adding to their list, end your message with a single line in exactly this format so the app can offer quick "add" buttons:
[[SUGGESTIONS: Name One, Name Two, Name Three]]
Only include this line when you are genuinely suggesting names to add. Never explain the line; the app hides it.

Here is where they are right now.

Their shortlist:
${shortlist}

New suggestions from family & friends they haven't sorted yet:
${suggestions}

Reference the shortlist and suggestions naturally when relevant, but let the couple lead.`;
}

// Look up a name's meaning, origin, and typical gender — a small touch of magic.
export async function enrichName(
  firstName: string,
): Promise<{ meaning?: string; origin?: string; gender?: string } | null> {
  if (!hasApiKey()) return null;
  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 200,
      system:
        'You are a concise baby-name reference. For the given first name, reply ONLY with compact JSON: {"origin": string, "meaning": string, "gender": "girl"|"boy"|"neutral"}. Keep origin to 1-3 words (e.g. "Greek", "Old English"). Keep meaning under 8 words, warm and plain. If unknown, use your best scholarly guess. No prose, no markdown.',
      messages: [{ role: "user", content: firstName }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const match = text.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { origin?: string; meaning?: string; gender?: string };
    const gender = ["girl", "boy", "neutral"].includes(parsed.gender ?? "") ? parsed.gender : undefined;
    return {
      origin: parsed.origin?.slice(0, 60) || undefined,
      meaning: parsed.meaning?.slice(0, 120) || undefined,
      gender,
    };
  } catch (err) {
    console.error("enrichName failed", err);
    return null;
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

// Streams the consultant's reply as plain text chunks via an async generator.
export async function* streamConsultant(
  ctx: ConsultantContext,
  history: ChatTurn[],
): AsyncGenerator<string> {
  if (!hasApiKey()) {
    yield mockReply(ctx, history);
    return;
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1200,
    system: buildSystemPrompt(ctx),
    messages: history.map((t) => ({ role: t.role, content: t.content })),
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// A graceful, human stand-in when no API key is configured, so the whole
// experience is explorable before wiring in the live model.
function mockReply(ctx: ConsultantContext, history: ChatTurn[]): string {
  const last = history[history.length - 1]?.content?.toLowerCase() ?? "";
  const parents = ctx.members.map((m) => m.name).filter(Boolean).join(" & ") || "you two";

  if (history.length <= 1) {
    return `Congratulations — this is such a lovely thing to be doing together. I'm so glad ${parents} are here.\n\nThere's no rush and no wrong answers. To start, tell me a little about the feeling you want ${ctx.babyLabel}'s name to carry — something classic and rooted, something soft and unusual, a name that honors family? And are there any names either of you already find yourselves drawn to?\n\n(I'm running in preview mode right now — add an Anthropic API key and I'll come fully to life.)`;
  }
  if (last.includes("family") || last.includes("grandma") || last.includes("heritage")) {
    return `Honoring family is one of the most meaningful ways in — a name can carry a whole story forward. Tell me the names on each side that mean something to you, and whether you'd want to use one outright or just borrow its sound or spirit. Sometimes a beloved grandmother's name lives best as a middle name.\n\n[[SUGGESTIONS: Eleanor, Rose, August]]`;
  }
  return `I hear you. Let's hold onto that and keep pulling the thread gently. What draws you to that — is it the sound, the meaning, or the way it feels to say out loud? And how does it sit next to ${ctx.lastName ? ctx.lastName : "your surname"}?\n\n[[SUGGESTIONS: Iris, Theodore, Maeve]]`;
}

// Pull the [[SUGGESTIONS: ...]] line out of a finished assistant message.
export function extractSuggestions(text: string): { clean: string; names: string[] } {
  const m = text.match(/\[\[SUGGESTIONS:\s*([^\]]+)\]\]/i);
  if (!m) return { clean: text.trim(), names: [] };
  const names = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clean = text.replace(m[0], "").trim();
  return { clean, names };
}
