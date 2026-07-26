"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import { openingMessage, CONVERSATION_STARTERS, MULTIPLES_STARTERS } from "@/lib/opening";
import { namedParents } from "@/lib/seat";
import { babiesLabel, slots } from "@/lib/babies";

type Me = { id: string; name: string; color: string };

function displayText(t: string) {
  const i = t.indexOf("[[");
  return i >= 0 ? t.slice(0, i).trimEnd() : t;
}

/// Names the consultant offered to save, and which list each belongs on.
type Chip = { name: string; role: "first" | "middle" };

function parseSuggestions(t: string): Chip[] {
  const pick = (label: string, role: Chip["role"]): Chip[] => {
    const m = t.match(new RegExp(`\\[\\[${label}:\\s*([^\\]]+)\\]\\]`, "i"));
    if (!m) return [];
    return m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, role }));
  };
  return [...pick("SUGGESTIONS", "first"), ...pick("MIDDLES", "middle")];
}

export default function ChatPanel({
  ws,
  me,
  onChanged,
}: {
  ws: WorkspaceState;
  me: Me;
  onChanged: () => void | Promise<void>;
}) {
  // The transcript is whatever the server says it is.
  //
  // It used to be seeded into state here, which meant it was fixed at mount:
  // the dashboard polls every few seconds and every other panel followed
  // along, but this one never did. So you never saw your partner's messages,
  // or the consultant's replies to them — while the server was faithfully
  // sending the model both halves. The consultant answered questions you
  // hadn't seen asked and referred to names you hadn't seen offered, which
  // reads exactly like it has lost the thread. It hadn't; you just weren't
  // being shown the same conversation.
  const [input, setInput] = useState("");
  /// The turn currently in flight — the one exchange that exists on screen
  /// before it exists in the database. `afterId` is the last message the
  /// server had when we started, so we can tell our own echo from an identical
  /// thing somebody typed an hour ago.
  const [sending, setSending] = useState<{ text: string; afterId: string | null } | null>(null);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  /// Whether they were reading the newest message when the last one arrived.
  /// Now that a partner's words can land unprompted, following the bottom of
  /// the conversation is only ever right if that's where they already were.
  const atBottom = useRef(true);
  const streaming = sending !== null;
  const decided = ws.status === "decided";
  const multiple = ws.babyCount > 1;
  const opening = openingMessage({
    babyLabel: babiesLabel(ws.babyLabel, ws.babyCount),
    parents: namedParents(ws.members),
    babyCount: ws.babyCount,
  });
  const waiting = slots(ws.babyCount).filter((s) => !ws.chosen.some((c) => c.slot === s));

  // Our own message, once the server has it. Until then the optimistic bubble
  // below stands in for it; after, the two would be the same words twice.
  const echoed = (() => {
    if (!sending) return false;
    const at = sending.afterId ? ws.messages.findIndex((m) => m.id === sending.afterId) : -1;
    return ws.messages.slice(at + 1).some((m) => m.role === "user" && m.content === sending.text);
  })();

  // What the transcript *is*, rather than which array happens to hold it. The
  // poll hands back a freshly parsed `ws.messages` every few seconds, so
  // depending on the array itself fires this effect on a timer even when
  // nothing was said — and each firing started another smooth scroll, which
  // dragged the reader back down mid-sentence and then, as it animated,
  // reported them as sitting at the bottom again. The guard below was correct
  // and never got the chance to work.
  const transcript = `${ws.messages.length}:${ws.messages[ws.messages.length - 1]?.id ?? ""}`;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!atBottom.current && !sending) return;
    // Set outright rather than animating. A smooth scroll is a request the
    // browser can decline — it doesn't run at all in a background tab — so the
    // panel would quietly stay where it was while messages piled up below,
    // and you'd come back to the tab already scrolled away from the newest
    // thing. It also tracks a streaming reply better: the text grows several
    // times a second, and an animation is still chasing the last position when
    // the next one arrives.
    el.scrollTop = el.scrollHeight;
  }, [transcript, live, sending]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || sending) return;
    setInput("");
    setChips([]);
    setError(null);
    setSending({ text: body, afterId: ws.messages[ws.messages.length - 1]?.id ?? null });
    setLive("");

    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id, message: body }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLive(displayText(acc));
      }
      setChips(parseSuggestions(acc));
    } catch {
      // Nothing came back at all, so this almost certainly never reached the
      // server — the route answers its own failures in words, and any of those
      // would have landed in `acc`. Give them back what they typed rather than
      // swallowing it, and don't paint a reply the consultant never made.
      if (!acc) {
        setInput(body);
        setError("That didn't send. Nothing's lost — try once more.");
      }
    }

    // The server writes the reply before it closes the stream, so by now both
    // turns are in the database and a refresh returns the real transcript.
    // That's what the optimistic bubbles were standing in for.
    try {
      await onChanged();
    } finally {
      setSending(null);
      setLive("");
    }
  }

  async function addChip({ name, role }: Chip) {
    const [firstName, ...rest] = name.split(" ");
    const res = await fetch("/api/names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: ws.id,
        role,
        // A middle name is one word — anything after it belongs to the first
        // name it will sit beside.
        firstName: role === "middle" ? name : firstName,
        middleName: role === "middle" ? undefined : rest.join(" ") || undefined,
        source: "ai",
      }),
    });
    setAdded((s) => new Set(s).add(name));
    onChanged();
    try {
      const { id } = await res.clone().json();
      if (id) {
        await fetch(`/api/names/${id}/enrich`, { method: "POST" });
        onChanged();
      }
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-line bg-card/60">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-pewter text-sm text-white">✦</span>
        <div>
          <div className="font-display text-lg leading-none text-ink">Your consultant</div>
          {/* Says plainly what it is. Someone paying to be advised deserves to
              know they're being advised by software — and it's persistent
              rather than a one-time notice, so it's true every time they look. */}
          <div className="text-xs text-ink-soft">An AI — unhurried, and awake at 3am</div>
        </div>
      </div>

      {/* The pair, held in view.
          Once one twin has a name, that name is the thing every remaining name
          is measured against — so it sits pinned under the header rather than
          scrolling away up the conversation, and it's the same fact the
          consultant is being given on every turn. */}
      {multiple && (
        <div className="border-b border-line bg-butter-soft/50 px-5 py-2.5 text-xs leading-relaxed text-[#8a6d1f]">
          {ws.chosen.length === 0 ? (
            <>
              <span className="font-semibold">
                {ws.babyCount === 3 ? "Three names" : "Two names"} to find.
              </span>{" "}
              I&apos;ll weigh each one on its own and as a set — how they sound side by side,
              initials, and whether they&apos;re too matchy.
            </>
          ) : (
            <>
              {ws.chosen.map((c) => (
                <span key={c.slot} className="mr-2">
                  <span className="font-semibold">{c.label}:</span> {c.fullName} ✦
                </span>
              ))}
              {waiting.length > 0 && (
                <>
                  Every name from here is weighed beside{" "}
                  {ws.chosen.map((c) => c.firstName).join(" and ")} — say them out loud together.
                </>
              )}
            </>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="scroll-soft flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {ws.messages.length === 0 && !sending && (
          <div className="animate-rise space-y-3">
            {/* Same text the server hands the model as its opening turn, so
                what's on screen and what the model believes it said agree. */}
            <Bubble role="assistant">{opening}</Bubble>
            {!decided && (
              <div className="flex flex-wrap gap-2 pl-1">
                {(multiple ? MULTIPLES_STARTERS : CONVERSATION_STARTERS).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-pewter transition hover:border-sage hover:bg-butter-soft"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {ws.messages.map((m) => (
          <Bubble key={m.id} role={m.role} author={m.authorName} color={m.authorColor}>
            {m.content}
          </Bubble>
        ))}

        {sending && !echoed && (
          <Bubble role="user" author={me.name} color={me.color}>
            {sending.text}
          </Bubble>
        )}

        {streaming && (
          <Bubble role="assistant">
            {live || <span className="inline-flex gap-1 text-pewter"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span>}
          </Bubble>
        )}

        {error && <div className="pl-1 text-xs text-ink-soft">{error}</div>}

        {chips.length > 0 && !streaming && (
          <div className="flex flex-wrap gap-2 pl-1">
            {chips.map((c) => {
              const isAdded = added.has(c.name);
              const middle = c.role === "middle";
              return (
                <button
                  key={`${c.role}:${c.name}`}
                  onClick={() => !isAdded && addChip(c)}
                  disabled={isAdded}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isAdded
                      ? "bg-sage/20 text-sage"
                      : middle
                        ? "border border-gold/70 bg-butter-soft text-[#8a6d1f] hover:bg-gold hover:text-white"
                        : "border border-sage bg-butter-soft text-sage-deep hover:bg-sage hover:text-white"
                  }`}
                >
                  {isAdded
                    ? `✓ ${c.name} saved`
                    : middle
                      ? `+ ${c.name} as a middle name`
                      : `+ Save ${c.name}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!decided && (
        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              disabled={ws.expired}
              placeholder={
                ws.expired
                  ? "Your window has closed — everything here is still yours to read."
                  : "Say anything — this is just between us…"
              }
              className="max-h-32 flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 outline-none focus:border-sage disabled:opacity-60"
            />
            <button
              onClick={() => send(input)}
              disabled={ws.expired || streaming || !input.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sage-deep text-white transition hover:bg-pewter disabled:opacity-50"
              aria-label="Send"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ role, author, color, children }: { role: string; author?: string | null; color?: string | null; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : ""}`}>
        {isUser && author && (
          <div className="mb-1 pr-1 text-right text-[11px] text-ink-soft">{author}</div>
        )}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser ? "rounded-br-sm bg-pewter text-white" : "rounded-bl-sm border border-line bg-card text-ink"
          }`}
          style={isUser && color ? { background: color } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-pewter/60" style={{ animationDelay: `${d}s` }} />;
}
