"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import { openingMessage, CONVERSATION_STARTERS, MULTIPLES_STARTERS } from "@/lib/opening";
import { namedParents } from "@/lib/seat";
import { babiesLabel, slots } from "@/lib/babies";
import { NUDGE_AT_REMAINING } from "@/lib/trial";
import RefundNote from "./RefundNote";

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
  upgradePrice,
}: {
  ws: WorkspaceState;
  me: Me;
  onChanged: () => void | Promise<void>;
  /// What continuing costs, formatted, from the server.
  ///
  /// Handed down rather than read from `lib/pricing.ts` here, and the reason
  /// is a trap rather than a preference: every price in that file is
  /// env-overridable, and Next only exposes `NEXT_PUBLIC_` variables to the
  /// browser. Imported into a client component it would quietly fall back to
  /// the hard-coded default — right today, and silently wrong the first time
  /// somebody changes a price in Vercel, on the one screen in the product
  /// that is asking for money.
  upgradePrice: string;
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
  /// The other parent, mid-question. The consultant answers one of them at a
  /// time — asking into the same breath is how two replies used to end up
  /// filed under each other's questions — so while this is set the composer
  /// waits rather than letting them talk over each other.
  const othersTurn = ws.turn && ws.turn.memberId !== me.id ? ws.turn : null;
  const otherName =
    othersTurn?.name ?? ws.members.find((m) => m.id !== me.id && m.joined)?.name ?? "Your partner";
  const decided = ws.status === "decided";
  const multiple = ws.babyCount > 1;

  // The free trial, from this viewer's chair.
  //
  // Everything below is per *person*, which is the whole reason it can't live
  // where the expired-journey banner lives: `ws.expired` is a fact about the
  // workspace and both parents meet it at the same moment, but free turns run
  // out one parent at a time. The two of them are looking at the same screen
  // from different accounts and are routinely in different states.
  const mySeat = ws.members.find((m) => m.id === me.id);
  const myTurnsLeft = mySeat?.freeTurnsLeft ?? null;
  const partner = ws.members.find((m) => m.id !== me.id && m.joined) ?? null;
  const partnerTurnsLeft = partner?.freeTurnsLeft ?? null;
  const outOfTurns = myTurnsLeft === 0;
  // Somebody who spent their ten elsewhere and has just opened a brand-new
  // journey. "That's the free trial" would read as a bug to them — they have
  // not typed a word here — so this state gets its own sentence, and it is
  // the first thing some people will ever see of the product.
  const neverStarted = outOfTurns && ws.messages.length === 0;
  const showNudge =
    myTurnsLeft !== null && myTurnsLeft > 0 && myTurnsLeft <= NUDGE_AT_REMAINING && !decided;
  const namedNames = ws.names.filter((n) => n.role !== "middle").length;
  const partnerRatings = partner
    ? ws.names.filter((n) => n.ratings.some((r) => r.memberId === partner.id)).length
    : 0;
  const partnerName = partner?.name ?? "your partner";
  // Composing is pointless once the composer is closed for good, and the two
  // reasons it can be closed read differently.
  const composerClosed = ws.expired || outOfTurns;
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
    // Hold what they typed rather than firing it into a turn that isn't theirs
    // yet — the server would refuse it anyway, and this way pressing Enter
    // early costs them nothing.
    if (othersTurn) return;
    // The server refuses this anyway; stopping here means a spent trial never
    // shows the composer clearing and a bubble appearing before it's taken
    // back again.
    if (composerClosed) return;
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
      // A refusal has a body too, and it is not a reply. Streamed straight
      // into a bubble it would put "turn_in_progress" on screen in the
      // consultant's voice — so read the status before reading the words.
      if (!res.ok) {
        setInput(body);
        // The server names the holder outright; our own guess is only a
        // fallback for when it couldn't.
        const held = res.headers.get("X-Turn-Holder");
        setError(
          res.status === 409
            ? `${held ? decodeURIComponent(held) : otherName} is asking something — yours will send once the consultant has answered.`
            : res.status === 402
              ? // Two different 402s now, and they are different facts. One is
                // about the journey and both parents are in it; the other is
                // about this person alone. The refresh is what paints the
                // wall — this line only has to cover the second or two before
                // the poll catches up.
                (await res.text()) === "free_trial_used"
                ? "That was your last free conversation — everything here is still yours to read."
                : "Your window has closed. Everything here is still yours to read."
              : "That didn't send. Nothing's lost — try once more.",
        );
        return;
      }
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
    } finally {
      // Every way out of here, including the refusals above. The server writes
      // the reply before it closes the stream, so by now both turns are in the
      // database and a refresh returns the real transcript — which is what the
      // optimistic bubbles were standing in for. A turn that was refused has
      // nothing to fetch, but it still has to hand the composer back.
      try {
        await onChanged();
      } finally {
        setSending(null);
        setLive("");
      }
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

      {/* The counter, from the first turn.
          Same pinned strip the twins reminder uses, for the same reason: it
          has to stay in view rather than scroll away. A visible limit creates
          anticipation; a limit somebody discovers at the wall creates a
          refund request — which is also why this appears at turn one rather
          than turn eight. */}
      {myTurnsLeft !== null && myTurnsLeft > 0 && !decided && (
        <div className="border-b border-line bg-butter-soft/50 px-5 py-2.5 text-xs leading-relaxed text-[#8a6d1f]">
          {myTurnsLeft === 1 ? (
            <>
              <span className="font-semibold">One free conversation left.</span> Make it count, or
              don&apos;t — it&apos;ll keep.
            </>
          ) : (
            <>
              <span className="font-semibold">{myTurnsLeft} free conversations left.</span> No rush
              — they don&apos;t expire.
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

        {/* Their question is already in the transcript above — it's saved
            before the reply is asked for — so the dots sit under it and read
            as the consultant thinking, which is exactly what's happening. */}
        {(streaming || othersTurn) && (
          <Bubble role="assistant">
            {live || <span className="inline-flex gap-1 text-pewter"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span>}
          </Bubble>
        )}

        {/* The nudge, two conversations out.
            Inline and after the reply, never a modal — an overlay at the
            emotional high of this product is the version that reads as an
            ambush. The argument is carried by the two numbers rather than by
            an adjective: what they have already built is the whole case, and
            saying "you've built something special here" out loud lands
            worse than showing it. */}
        {showNudge && !streaming && (
          <div className="animate-rise rounded-2xl border border-line bg-butter-soft/60 px-4 py-3.5 text-sm leading-relaxed text-ink">
            {namedNames > 0 ? (
              <p>
                You&apos;ve got <span className="font-semibold">{namedNames} names</span> saved
                {partner && partnerRatings > 0 && (
                  <>
                    {" "}
                    and {partnerName} has weighed in on {partnerRatings} of them
                  </>
                )}
                . {myTurnsLeft === 1 ? "One conversation" : `${myTurnsLeft} conversations`} left in
                the free trial — then this all stays exactly where it is, and you can pick it up
                whenever.
              </p>
            ) : (
              // Not optional. Plenty of couples talk for eight turns before
              // saving a single name, and the version above would tell them
              // they have nought of something.
              <p>
                {myTurnsLeft === 1 ? "One conversation" : `${myTurnsLeft} conversations`} left in
                the free trial. Whatever you&apos;ve talked about stays right here — nothing goes
                away when the count runs out.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <UpgradeButton workspaceId={ws.id} label={`Keep going · ${upgradePrice}`} />
              <span className="text-xs text-ink-soft">Or ask someone to gift it</span>
            </div>
          </div>
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

      {/* The wall.
          Three states, because ten-each makes this a fact about a person
          rather than about the journey. What it does *not* do is as
          deliberate as what it does: no second countdown, no "offer expires",
          no discount for acting now. The one thing it promises is that
          nothing was taken away, and that promise is the entire reason
          somebody comes back. */}
      {!decided && outOfTurns && (
        <div className="border-t border-line bg-butter-soft/60 p-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            {neverStarted ? (
              // They have typed nothing here. "That's the free trial" would
              // read as a bug, and for some people this is the first thing
              // they ever see of the product — so it reads like a price
              // rather than like a door closing.
              <>
                <span className="font-display text-base text-pewter">
                  You&apos;ve used your free conversations.
                </span>{" "}
                Journeys are {upgradePrice} and this one&apos;s ready when you are — the
                consultant, the shortlist, a seat for your partner, and the keepsake at the end.
              </>
            ) : partnerTurnsLeft !== null && partnerTurnsLeft > 0 ? (
              // The common case: almost nobody spends theirs in lockstep. The
              // last sentence is the strongest one in the flow and it is
              // literally true — the window is a fact about the workspace, so
              // one payment has always covered both seats.
              <>
                <span className="font-display text-base text-pewter">That&apos;s your ten.</span>{" "}
                Everything here is still yours to read, and {partnerName} has {partnerTurnsLeft}{" "}
                {partnerTurnsLeft === 1 ? "conversation" : "conversations"} left. Whenever either
                of you continues for {upgradePrice}, it opens for both of you.
              </>
            ) : (
              <>
                <span className="font-display text-base text-pewter">
                  That&apos;s the free trial{partner ? ", for both of you" : ""}.
                </span>{" "}
                Everything here is still yours to read — the conversation, your shortlist
                {partner ? `, ${partnerName}'s ratings` : ""}. Pick it up whenever you&apos;re
                ready.
              </>
            )}
          </p>
          <div className="mt-3">
            <UpgradeButton workspaceId={ws.id} label={`Continue · ${upgradePrice}`} />
          </div>
          {/* Under the button that charges, and nowhere else — see the note on
              the component. Deliberately not repeated under the nudge above. */}
          <RefundNote />
        </div>
      )}

      {!decided && !outOfTurns && (
        <div className="border-t border-line p-3">
          {/* Say who has the floor rather than leaving a dead send button.
              Typing stays open — they can be composing their thought while the
              consultant answers, and it goes the moment the reply lands. */}
          {othersTurn && (
            <div className="mb-2 flex items-center gap-2 pl-1 text-xs text-ink-soft">
              <span className="inline-flex gap-1"><Dot /><Dot d={0.2} /><Dot d={0.4} /></span>
              {otherName} is asking the consultant something…
            </div>
          )}
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
              disabled={composerClosed}
              placeholder={
                ws.expired
                  ? "Your window has closed — everything here is still yours to read."
                  : "Say anything — this is just between us…"
              }
              className="max-h-32 flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 outline-none focus:border-sage disabled:opacity-60"
            />
            <button
              onClick={() => send(input)}
              disabled={composerClosed || streaming || Boolean(othersTurn) || !input.trim()}
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

/// The one button in the trial that takes money. Posts the `upgrade` kind,
/// which buys the journey they are standing in rather than building a second
/// empty one beside it.
function UpgradeButton({ workspaceId, label }: { workspaceId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "upgrade", workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={go}
        disabled={busy}
        className="rounded-full bg-sage-deep px-5 py-2 text-sm font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
      >
        {busy ? "One moment…" : label}
      </button>
      {error && <span className="text-xs text-sage-deep">{error}</span>}
    </span>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-pewter/60" style={{ animationDelay: `${d}s` }} />;
}
