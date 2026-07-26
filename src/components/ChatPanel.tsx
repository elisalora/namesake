"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import { openingMessage, CONVERSATION_STARTERS, MULTIPLES_STARTERS } from "@/lib/opening";
import { namedParents } from "@/lib/seat";
import { babiesLabel, slots } from "@/lib/babies";

type Me = { id: string; name: string; color: string };
type Msg = { role: string; content: string; authorName?: string | null; authorColor?: string | null };

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

export default function ChatPanel({ ws, me, onChanged }: { ws: WorkspaceState; me: Me; onChanged: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(ws.messages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const decided = ws.status === "decided";
  const multiple = ws.babyCount > 1;
  const opening = openingMessage({
    babyLabel: babiesLabel(ws.babyLabel, ws.babyCount),
    parents: namedParents(ws.members),
    babyCount: ws.babyCount,
  });
  const waiting = slots(ws.babyCount).filter((s) => !ws.chosen.some((c) => c.slot === s));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");
    setChips([]);
    setMessages((m) => [...m, { role: "user", content: text, authorName: me.name, authorColor: me.color }]);
    setStreaming(true);
    setLive("");

    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id, message: text }),
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
    } catch {
      acc += "\n\n(Sorry — something interrupted us. Try once more?)";
    }

    const clean = displayText(acc);
    setMessages((m) => [...m, { role: "assistant", content: clean }]);
    setChips(parseSuggestions(acc));
    setLive("");
    setStreaming(false);
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

      <div ref={scrollRef} className="scroll-soft flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
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

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} author={m.authorName} color={m.authorColor}>
            {m.content}
          </Bubble>
        ))}

        {streaming && (
          <Bubble role="assistant">
            {live || <span className="inline-flex gap-1 text-pewter"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span>}
          </Bubble>
        )}

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
