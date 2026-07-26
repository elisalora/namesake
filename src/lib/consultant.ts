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
  /// girl | boy | mixed | surprise | null — steers which names are worth
  /// suggesting.
  expecting?: string | null;
  /// How many babies are being named. Two or three changes the job: every
  /// name is half of a set from the first message onwards.
  babyCount: number;
  /// The babies who already have a name. Once one twin is named, it is the
  /// single most important fact in the conversation — everything still being
  /// considered has to live next to it.
  named: { label: string; fullName: string }[];
  /// The babies still waiting, by label.
  waiting: string[];
  /// What the panel has already shown them as your opening line.
  opening?: string | null;
  members: { name: string }[];
  shortlist: {
    firstName: string;
    middleName?: string | null;
    status: string;
    ratings: { member: string; score: number; veto: boolean }[];
    note?: string | null;
  }[];
  /// Middle names under consideration — a list of their own, because a middle
  /// name is chosen against a first name rather than instead of one.
  middleShortlist: { name: string; ratings: { member: string; score: number; veto: boolean }[] }[];
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

  const expecting =
    ctx.expecting === "girl"
      ? " They are expecting a girl — suggest girls' names, and names that work for a girl, unless they ask otherwise."
      : ctx.expecting === "boy"
        ? " They are expecting a boy — suggest boys' names, and names that work for a boy, unless they ask otherwise."
        : ctx.expecting === "mixed"
        ? " They are expecting one of each — a girl and a boy — so they need a girl's name and a boy's name, and the two have to sit together as a set."
        : ctx.expecting === "surprise"
          ? " They have chosen not to find out the sex. Favour names that work either way, and do not ask them what they are having — they have decided, and asking again is a small unkindness."
          : "";

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

  // Twins and triplets. Two jobs, not one: each name has to be loved on its
  // own, and the set has to work said aloud together.
  const multiples =
    ctx.babyCount > 1
      ? `\n\nThey are expecting ${ctx.babyCount === 3 ? "triplets" : "twins"} — ${ctx.babyCount === 3 ? "three names" : "two names"}, not one. That changes your job. Every name has to be loved on its own AND has to work beside the others when the two of them are called across a room together, which will happen every day for the rest of their childhood. Think about the pair, out loud, whenever you suggest something: how they sound one after another, whether they're too matchy (rhyming, sharing an initial, a letter apart) or so mismatched they sound like they came from different families, whether the initials collide, and whether one child would grow up feeling their name got less thought than their sibling's. Names that rhyme with each other or are easily muddled are the one thing to raise plainly — kindly, once, and then let them decide, because plenty of families adore a matched set.`
      : "";

  const namedSoFar =
    ctx.named.length > 0
      ? `\n\nAlready named:\n${ctx.named.map((n) => `• ${n.label} — ${n.fullName}`).join("\n")}\n\nThis is settled and joyful; never reopen it or suggest they reconsider unless they raise it themselves. From here on, ${
          ctx.waiting.length === 1 ? `there is one name left to find (${ctx.waiting[0]})` : `there are ${ctx.waiting.length} names left to find (${ctx.waiting.join(", ")})`
        }, and every single name you suggest must be weighed out loud against ${ctx.named.map((n) => n.fullName.split(" ")[0]).join(" and ")} — say how the pair sounds together in the same breath as the suggestion, every time. Do not suggest anything that rhymes with an already-chosen name, begins with the same sound, or is a letter or two away from it, unless they ask for exactly that.`
      : "";

  const middleShortlist =
    ctx.middleShortlist.length > 0
      ? ctx.middleShortlist
          .map((n) => {
            const ratings = n.ratings
              .map((r) => `${r.member}: ${r.veto ? "SET ASIDE" : `${r.score}/5`}`)
              .join(", ");
            return `• ${n.name}${ratings ? ` (${ratings})` : ""}`;
          })
          .join("\n")
      : "(none yet)";

  const suggestions =
    ctx.newSuggestions.length > 0
      ? ctx.newSuggestions
          .map(
            (s) =>
              `• ${s.name} — suggested by ${s.from}${s.relationship ? ` (${s.relationship})` : ""}${s.reason ? `: "${s.reason}"` : ""}`,
          )
          .join("\n")
      : "(none yet)";

  return `You are the consultant inside Namesake — a warm, wise, unhurried companion helping ${parentLine} choose ${ctx.babyCount > 1 ? `names for ${ctx.babyLabel}` : `a name for ${ctx.babyLabel}`}.${surname}${expecting}${multiples}${namedSoFar}

Choosing a baby's name is emotional and high-stakes, and the people you're talking to may feel overwhelmed or pulled in different directions by family and expectation. Your whole purpose is to make this feel joyful, collaborative, and low-pressure — to help them arrive at a name they genuinely love and feel at peace with.

How you show up:
- Warm, calm, and genuinely curious. You are a thoughtful friend who happens to know a great deal about names — never a search engine, never a pushy salesperson.
- You ask gentle, opening questions: the feeling they want the name to carry, family or heritage that matters, sounds and styles they're drawn to, names they've already loved or ruled out, sibling names, how it sits with the surname.
- You suggest names sparingly and with a reason — the meaning, origin, the feeling, or why it suits what they've told you. A few well-chosen names beat a long list. Never dump twenty names.
- You gently surface practical things worth a glance — unfortunate initials, teasing potential, spelling or pronunciation burden, extreme trendiness — but always kindly, always framed as "worth a thought," never as a verdict. The parents decide. You never veto.
${
  parents.length > 1
    ? "- You hold space for two people who may disagree. If one parent has vetoed a name, honor it gracefully and help them find something they can both love. Celebrate overlap when you see it."
    : "- Right now you are talking with one person, and you must not assume there is a second. Do not ask what their partner thinks, refer to \"the two of you\", or imply anyone else should be consulted. Someone may be doing this alone by choice or by circumstance, and either way this is their decision to make. If they mention a partner themselves, follow their lead."
}
- You actively relax social pressure. Reassure them that it's their choice, that no name is perfect, that they're allowed to change their minds, and that the "right" name is the one that feels like theirs.

Style: conversational and concise — a few short paragraphs at most. Warm but not saccharine. Write in plain text like a text message — NO markdown, no asterisks, no bold, no headers, no bullet-point avalanches. When you mention a specific name in the flow of a sentence, just write it plainly (Willow, not **Willow**). Speak to them as a couple.

Middle names are their own list in the app, kept separately from first names, and they are chosen against a first name rather than instead of one. Treat them as their own conversation when it comes up: the middle name is where a grandmother, a maiden name, a saint, or a name one of them loves but couldn't quite put first tends to live, and it's said in full far less often than people fear. When you suggest middle names, say the whole name out loud in your reply — "Willow Rose Rivera" — because that's the only way to hear whether it works, and mention the initials if they make a word.

When you propose specific candidate names you think they should consider adding to their list, end your message with a single line in exactly this format so the app can offer quick "add" buttons:
[[SUGGESTIONS: Name One, Name Two, Name Three]]
When the names you're proposing are middle names, use this line instead, so they land on the middle-name list rather than the first-name one:
[[MIDDLES: Name One, Name Two]]
Only include these lines when you are genuinely suggesting names to add, and never both kinds in one line. Never explain them; the app hides them.

You have already greeted them. These exact words are on their screen above the conversation:

"""
${ctx.opening ?? ""}
"""

Treat that as something you said. Their first message is a reply to it — do not greet them again or ask what brings them here.

Here is where they are right now.

Their shortlist:
${shortlist}

Middle names they're weighing:
${middleShortlist}

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
    // Silent enrichment failure is why a name can sit untagged forever, and
    // the cause is usually the configured model rather than the name.
    const e = err as { status?: number; message?: string };
    console.error(
      `[namesake] enrichName failed for "${firstName}" ` +
        `(model=${ENRICH_MODEL}, status=${e?.status ?? "none"}): ${e?.message ?? String(err)}`,
    );
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
    // In development, stand-in replies make the whole product explorable
    // without a key. In production they'd be canned text dressed up as the
    // thing someone paid for, which is worse than saying nothing — so be
    // honest to them and loud to us.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[namesake] chat requested but ANTHROPIC_API_KEY is not set — the consultant is offline",
      );
      yield "I'm not able to answer just now — something on our side needs attention. Nothing you've written is lost, and the shortlist still works. Do try again shortly.";
      return;
    }
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

// A stand-in for local development only, so the product is explorable without
// a key.
//
// It must never return the opening greeting: the chat panel already shows one
// before anyone types, and `history` always contains at least the message just
// sent — so a greeting here reads as the consultant ignoring you and repeating
// itself, which is exactly what it used to do.
function mockReply(ctx: ConsultantContext, history: ChatTurn[]): string {
  const last = history[history.length - 1]?.content?.toLowerCase() ?? "";

  // With one twin already named, the stand-in should behave like the real
  // thing does — every suggestion said out loud beside the name they have.
  if (last.includes("middle")) {
    const first = ctx.shortlist[0]?.firstName ?? "Willow";
    const sur = ctx.lastName ? ` ${ctx.lastName}` : "";
    return `The middle name is where the weight can go — a grandmother, a maiden name, the one you love but couldn't quite put first. Say it in full and listen: ${first} Rose${sur}, ${first} Margot${sur}. Nobody hears it much, which is exactly what makes it the safe place for something sentimental.\n\n[[MIDDLES: Rose, Margot, June]]`;
  }

  const sibling = ctx.named[0]?.fullName.split(" ")[0];
  if (sibling) {
    return `Holding ${sibling} in mind as we go. Say them together — ${sibling} and Rowan, ${sibling} and Theodora — and listen for whether they sound like a pair or like two only children. Neither is wrong; it just wants to be on purpose.\n\n[[SUGGESTIONS: Rowan, Theodora, Silas]]`;
  }

  if (last.includes("family") || last.includes("grandma") || last.includes("heritage")) {
    return `Honoring family is one of the most meaningful ways in — a name can carry a whole story forward. Tell me the names on each side that mean something to you, and whether you'd want to use one outright or just borrow its sound or spirit. Sometimes a beloved grandmother's name lives best as a middle name.\n\n[[SUGGESTIONS: Eleanor, Rose, August]]`;
  }
  return `I hear you. Let's hold onto that and keep pulling the thread gently. What draws you to that — is it the sound, the meaning, or the way it feels to say out loud? And how does it sit next to ${ctx.lastName ? ctx.lastName : "your surname"}?\n\n[[SUGGESTIONS: Iris, Theodore, Maeve]]`;
}

// Pull the quick-add lines out of a finished assistant message: names to add
// as first names, and names to add as middle names.
export function extractSuggestions(text: string): {
  clean: string;
  names: string[];
  middles: string[];
} {
  let clean = text;
  const take = (label: string) => {
    const m = clean.match(new RegExp(`\\[\\[${label}:\\s*([^\\]]+)\\]\\]`, "i"));
    if (!m) return [];
    clean = clean.replace(m[0], "");
    return m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const names = take("SUGGESTIONS");
  const middles = take("MIDDLES");
  return { clean: clean.trim(), names, middles };
}
