"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";

type Me = { id: string; name: string; color: string };
type Msg = { role: string; content: string; authorName?: string | null; authorColor?: string | null };

const STARTERS = [
  "We're honestly stuck — where do we start?",
  "We'd love a name that honors family.",
  "We like classic names that aren't too common.",
  "Something short and nature-inspired?",
];

function displayText(t: string) {
  const i = t.indexOf("[[");
  return i >= 0 ? t.slice(0, i).trimEnd() : t;
}

function parseSuggestions(t: string): string[] {
  const m = t.match(/\[\[SUGGESTIONS:\s*([^\]]+)\]\]/i);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

export default function ChatPanel({ ws, me, onChanged }: { ws: WorkspaceState; me: Me; onChanged: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(ws.messages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const decided = ws.status === "decided";

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

  async function addChip(nameStr: string) {
    const [firstName, ...rest] = nameStr.split(" ");
    const res = await fetch("/api/names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: ws.id, firstName, middleName: rest.join(" ") || undefined, source: "ai" }),
    });
    setAdded((s) => new Set(s).add(nameStr));
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
        <span className="grid h-8 w-8 place-items-center rounded-full bg-plum text-sm text-white">✦</span>
        <div>
          <div className="font-display text-lg leading-none text-ink">Your consultant</div>
          <div className="text-xs text-ink-soft">here to help, never to push</div>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-soft flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="animate-rise space-y-3">
            <Bubble role="assistant">
              Congratulations — what a lovely thing to be doing together. There&apos;s no rush and no
              wrong answers here. Tell me a little about the name you&apos;re dreaming of for{" "}
              <span className="font-semibold">{ws.babyLabel}</span> — a feeling, a family story, a
              sound you love — and we&apos;ll find our way from there.
            </Bubble>
            {!decided && (
              <div className="flex flex-wrap gap-2 pl-1">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-plum transition hover:border-rose hover:bg-blush"
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
            {live || <span className="inline-flex gap-1 text-plum"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span>}
          </Bubble>
        )}

        {chips.length > 0 && !streaming && (
          <div className="flex flex-wrap gap-2 pl-1">
            {chips.map((c) => {
              const isAdded = added.has(c);
              return (
                <button
                  key={c}
                  onClick={() => !isAdded && addChip(c)}
                  disabled={isAdded}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isAdded ? "bg-sage/20 text-sage" : "border border-rose bg-blush text-rose-deep hover:bg-rose hover:text-white"
                  }`}
                >
                  {isAdded ? `✓ ${c} saved` : `+ Save ${c}`}
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
              className="max-h-32 flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 outline-none focus:border-rose disabled:opacity-60"
            />
            <button
              onClick={() => send(input)}
              disabled={ws.expired || streaming || !input.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-deep text-white transition hover:bg-plum disabled:opacity-50"
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
            isUser ? "rounded-br-sm bg-plum text-white" : "rounded-bl-sm border border-line bg-card text-ink"
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
  return <span className="h-2 w-2 animate-bounce rounded-full bg-plum/60" style={{ animationDelay: `${d}s` }} />;
}
