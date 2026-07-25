// The consultant's first words.
//
// Lives here, importing nothing, because both sides need it: the chat panel
// paints it before anyone types, and the server has to hand the same text to
// the model as the assistant's opening turn. Otherwise the model never learns
// what it supposedly just asked, and someone answering the question — "we like
// classic names that aren't too common" — arrives as a non-sequitur.

export function openingMessage(opts: { babyLabel: string; parents: string[] }) {
  const who =
    opts.parents.length === 2
      ? `${opts.parents[0]} and ${opts.parents[1]}`
      : opts.parents[0] || "";
  const greeting = who ? `Congratulations, ${who} — what a lovely thing to be doing.` : "Congratulations — what a lovely thing to be doing.";

  return `${greeting} There's no rush here and no wrong answers.

Tell me a little about the name you're imagining for ${opts.babyLabel} — a feeling you want it to carry, a family story, a sound you love — and we'll find our way from there.`;
}

/// Openers offered as one-tap chips before the conversation has started.
export const CONVERSATION_STARTERS = [
  "We like classic names that aren't too common",
  "We'd love something that honours family",
  "Something short and easy to say",
  "We can't agree — help",
];
