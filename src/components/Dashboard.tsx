"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WorkspaceState } from "@/lib/workspace";
import { seatLabel, DEFAULT_PARTNER_NAME } from "@/lib/seat";
import { babiesLabel, slotLabel, slots } from "@/lib/babies";
import NameYourself from "./NameYourself";
import JourneyDetails from "./JourneyDetails";
import ChatPanel from "./ChatPanel";
import ShortlistPanel from "./ShortlistPanel";
import SignOutButton from "./SignOutButton";
import KeepsakeUpsell from "./KeepsakeUpsell";

type Me = { id: string; name: string; color: string };

export default function Dashboard({
  initial,
  me,
  origin,
  showWelcome,
}: {
  initial: WorkspaceState;
  me: Me;
  /// Passed down from the server so the share links are correct on first paint
  /// — reading window.location during render isn't pure, and doing it in an
  /// effect meant a flash of empty URLs.
  origin: string;
  showWelcome: boolean;
}) {
  const [ws, setWs] = useState(initial);
  const [welcome, setWelcome] = useState(showWelcome);
  const [share, setShare] = useState(false);
  const [details, setDetails] = useState(false);
  const [decideOpen, setDecideOpen] = useState<string | null>(null); // preselected nameId
  const [mobileTab, setMobileTab] = useState<"chat" | "list">("chat");
  const [reveal, setReveal] = useState<number | null>(null); // the slot just named

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${ws.id}`);
    if (res.ok) {
      const data = await res.json();
      setWs(data.workspace);
    }
  }, [ws.id]);

  // Poll gently so both partners see each other's changes.
  useEffect(() => {
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [refresh]);

  const decided = ws.status === "decided";
  // "Decide together" is a promise about two people. Somebody doing this alone
  // shouldn't be told to agree with an empty chair.
  const together = ws.members.filter((m) => m.joined).length > 1;
  // With twins the decision happens twice, so what matters isn't "have they
  // decided" but "who is still waiting".
  const waiting = slots(ws.babyCount).filter((s) => !ws.chosen.some((c) => c.slot === s));
  const partly = ws.chosen.length > 0 && waiting.length > 0;
  const babies = babiesLabel(ws.babyLabel, ws.babyCount);
  // The one unclaimed seat is the only source of an invite link. It used to
  // fall back to the token in the URL, which meant that reloading an old
  // ?invite= link kept showing a way in after the seat was taken. A journey
  // holds two people; once the second has arrived there is nobody left to
  // invite, and the link should stop existing.
  const seatToken = ws.pendingSeat?.token ?? null;
  const inviteUrl = seatToken ? `${origin}/join/${seatToken}` : "";
  const familyUrl = `${origin}/s/${ws.suggestSlug}`;

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="font-display text-xl font-semibold text-pewter">
            Namesake
          </Link>
          <button
            onClick={() => setDetails(true)}
            title="Edit these details"
            className="hidden items-center gap-2 rounded-full px-2 py-1 text-sm text-ink-soft transition hover:bg-card sm:flex"
          >
            <span>Naming</span>
            <span className="font-display text-base text-ink">{babies}</span>
            {ws.lastName && <span>· {ws.lastName}</span>}
            <span aria-hidden className="text-xs text-pewter-light">✎</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {ws.members
                .filter((m) => m.joined)
                .map((m) => (
                <span
                  key={m.id}
                  title={m.name}
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-paper text-[11px] font-bold text-white"
                  style={{ background: m.color }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
            <button
              onClick={() => setShare(true)}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-pewter transition hover:border-sage"
            >
              Share
            </button>
            <SignOutButton className="hidden sm:inline" />
            {!decided && !ws.expired && (
              <button
                onClick={() => setDecideOpen("")}
                className="rounded-full bg-sage-deep px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-pewter"
              >
                {partly
                  ? `Name ${slotLabel(waiting[0])}`
                  : together
                    ? "Decide together"
                    : "Decide"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Your own seat, still unnamed — which also means you're missing from
          the line family and friends see. */}
      {ws.members.some((m) => m.id === me.id && m.name === DEFAULT_PARTNER_NAME) && (
        <NameYourself workspaceId={ws.id} onChanged={refresh} />
      )}

      <WindowBanner ws={ws} />

      {decided && ws.chosen.length > 0 && (
        <DecidedBanner ws={ws} origin={origin} onChanged={refresh} />
      )}

      {/* The decision moment is peak emotion — the one place a made-to-order
          keepsake sells itself. With twins it's two. */}
      {decided && ws.chosen.length > 0 && <KeepsakeUpsell ws={ws} />}

      {/* Half-named. The one thing that has to stay in front of them from here
          on: who already has a name, so every name still being weighed is
          weighed beside it. */}
      {partly && <PartlyNamedBanner ws={ws} waiting={waiting} onName={() => setDecideOpen("")} onChanged={refresh} />}

      {/* Mobile segmented control */}
      <div className="mx-auto w-full max-w-7xl px-5 pt-4 lg:hidden">
        <div className="flex rounded-full border border-line bg-card p-1 text-sm">
          {(["chat", "list"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 rounded-full py-2 font-semibold transition ${
                mobileTab === t ? "bg-pewter text-white" : "text-ink-soft"
              }`}
            >
              {t === "chat" ? "Consultant" : `Shortlist${ws.names.length ? ` (${ws.names.length})` : ""}`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDetails(true)}
          className="mt-2 w-full text-center text-xs text-ink-soft underline underline-offset-2"
        >
          Edit {ws.babyCount > 1 ? "your" : `${ws.babyLabel}'s`} details
        </button>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-5 py-4 lg:grid-cols-2 lg:py-5">
        <div className={`h-[calc(100vh-11rem)] lg:h-[calc(100vh-8rem)] ${mobileTab === "chat" ? "block" : "hidden"} lg:block`}>
          <ChatPanel ws={ws} me={me} onChanged={refresh} />
        </div>
        <div
          className={`scroll-soft h-[calc(100vh-11rem)] overflow-y-auto lg:h-[calc(100vh-8rem)] lg:pr-1 ${
            mobileTab === "list" ? "block" : "hidden"
          } lg:block`}
        >
          <ShortlistPanel ws={ws} me={me} onChanged={refresh} onChoose={(id) => setDecideOpen(id)} />
        </div>
      </main>

      {welcome && (
        <WelcomeModal ws={ws} inviteUrl={inviteUrl} familyUrl={familyUrl} onClose={() => setWelcome(false)} />
      )}
      {share && (
        <ShareModal ws={ws} inviteUrl={inviteUrl} familyUrl={familyUrl} onClose={() => setShare(false)} />
      )}
      {details && (
        <Modal onClose={() => setDetails(false)}>
          <h2 className="font-display text-2xl text-ink">The details</h2>
          <p className="mb-5 mt-1 text-sm text-ink-soft">
            Everything here was optional at the start. Fill in what you know now.
          </p>
          <JourneyDetails ws={ws} onSaved={setWs} onClose={() => setDetails(false)} />
        </Modal>
      )}
      {decideOpen !== null && (
        <DecideModal
          ws={ws}
          preselect={decideOpen}
          waiting={waiting}
          onClose={() => setDecideOpen(null)}
          onDecided={async (slot) => {
            setDecideOpen(null);
            await refresh();
            setReveal(slot);
          }}
        />
      )}
      {reveal !== null && ws.chosen.some((c) => c.slot === reveal) && (
        <RevealOverlay ws={ws} slot={reveal} onClose={() => setReveal(null)} />
      )}
    </div>
  );
}

/* Full-screen emotional reveal the moment a name is chosen. With twins it
   happens once per baby: the first is a milestone worth stopping for, and
   pretending it's the finale would be a lie about what's left to do. */
function RevealOverlay({ ws, slot, onClose }: { ws: WorkspaceState; slot: number; onClose: () => void }) {
  const just = ws.chosen.find((c) => c.slot === slot)!;
  const others = ws.chosen.filter((c) => c.slot !== slot);
  const left = ws.babyCount - ws.chosen.length;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#fdf6e6] px-6 text-center">
      <Confetti />
      <div className="animate-rise relative">
        <div className="font-display text-sm uppercase tracking-[0.35em] text-gold">
          {ws.babyCount > 1 ? `${just.label}'s name is` : "Your baby's name is"}
        </div>
        <h1 className="mt-6 font-display text-6xl leading-tight text-pewter sm:text-8xl">
          {just.fullName}
        </h1>
        <div className="mx-auto my-8 flex items-center justify-center gap-3 text-gold">
          <span className="h-px w-16 bg-gold/50" />
          <span className="text-xl">✦</span>
          <span className="h-px w-16 bg-gold/50" />
        </div>
        {others.length > 0 && (
          <p className="mb-3 font-display text-2xl text-pewter">
            alongside {others.map((c) => c.fullName).join(" and ")}
          </p>
        )}
        <p className="text-lg text-ink-soft">
          {left > 0
            ? `Congratulations — one name found. ${left === 1 ? "One" : String(left)} more to go, and from here every name gets weighed beside ${just.firstName}.`
            : "Congratulations. What a beautiful choice."}
        </p>
        <button
          onClick={onClose}
          className="mt-8 rounded-full bg-gold px-8 py-3 font-display text-lg text-white transition hover:brightness-95"
        >
          {left > 0 ? "Keep going" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Decided banner + celebration ---------- */

function DecidedBanner({
  ws,
  origin,
  onChanged,
}: {
  ws: WorkspaceState;
  origin: string;
  onChanged: () => void;
}) {
  const many = ws.chosen.length > 1;
  return (
    <div className="relative overflow-hidden border-b border-gold/40 bg-[#fdf6e6]">
      <Confetti />
      <div className="relative mx-auto max-w-7xl px-5 py-6 text-center">
        <div className="text-xs uppercase tracking-widest text-[#8a6d1f]">
          You chose {many ? "their names" : "a name"}
        </div>
        {ws.chosen.map((c) => (
          <div key={c.slot} className={many ? "mt-2" : ""}>
            {many && <div className="text-xs uppercase tracking-widest text-[#8a6d1f]/70">{c.label}</div>}
            <div className="font-display text-4xl text-pewter sm:text-5xl">{c.fullName}</div>
            {c.reason && <p className="mx-auto mt-1 max-w-2xl text-ink-soft">“{c.reason}”</p>}
          </div>
        ))}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/w/${ws.id}/keepsake`}
            className="rounded-full bg-gold px-5 py-2.5 font-semibold text-white transition hover:brightness-95"
          >
            View the keepsake
          </Link>
          <button
            onClick={() => navigator.clipboard.writeText(`${origin}/w/${ws.id}/keepsake`)}
            className="rounded-full border border-gold/60 px-5 py-2.5 font-semibold text-[#8a6d1f]"
          >
            Copy keepsake link
          </button>
          {/* Nothing is final until the birth certificate. Reopening puts the
              name (or names) back on the shortlist rather than pretending the
              decision can't be revisited. */}
          <button
            onClick={async () => {
              await fetch("/api/decide", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId: ws.id }),
              });
              onChanged();
            }}
            className="rounded-full px-4 py-2.5 text-sm text-ink-soft hover:text-pewter"
          >
            Keep exploring
          </button>
        </div>
      </div>
    </div>
  );
}

/// One twin named, one still to go.
///
/// This is the state the whole multiples feature exists for, so it's a
/// permanent band across the top rather than a message that scrolls away: the
/// name they've settled on has to be in front of them while they weigh the
/// next one, because that's now the thing every remaining name is judged
/// against.
function PartlyNamedBanner({
  ws,
  waiting,
  onName,
  onChanged,
}: {
  ws: WorkspaceState;
  waiting: number[];
  onName: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function undo(nameId: string) {
    setBusy(true);
    await fetch("/api/decide", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: ws.id, nameId }),
    });
    onChanged();
    setBusy(false);
  }

  return (
    <div className="border-b border-gold/40 bg-[#fdf6e6]/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {ws.chosen.map((c) => (
            <span key={c.slot} className="flex items-baseline gap-1.5">
              <span className="text-xs uppercase tracking-widest text-[#8a6d1f]">{c.label}</span>
              <span className="font-display text-xl text-pewter">{c.fullName}</span>
              <span className="text-gold">✦</span>
              <button
                onClick={() => undo(c.nameId)}
                disabled={busy || ws.expired}
                className="text-xs text-ink-soft underline underline-offset-2 transition hover:text-pewter disabled:opacity-50"
              >
                change
              </button>
            </span>
          ))}
          <span className="text-ink-soft">
            {waiting.length === 1 ? "One name left" : `${waiting.length} names left`} — everything
            from here is weighed beside{" "}
            {ws.chosen.map((c) => c.firstName).join(" and ")}.
          </span>
        </div>
        {!ws.expired && (
          <button
            onClick={onName}
            className="shrink-0 rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95"
          >
            Name {slotLabel(waiting[0])}
          </button>
        )}
      </div>
    </div>
  );
}

function Confetti() {
  const hearts = Array.from({ length: 18 });
  return (
    <div className="pointer-events-none absolute inset-0">
      {hearts.map((_, i) => (
        <span
          key={i}
          className="absolute text-lg"
          style={{
            left: `${(i * 5.5 + 3) % 100}%`,
            bottom: "-10px",
            animation: `float-up ${3 + (i % 4)}s ease-in ${(i % 6) * 0.4}s infinite`,
            color: ["#c07a9b", "#c19a4b", "#7f9a82"][i % 3],
          }}
        >
          {["♥", "✦", "❀"][i % 3]}
        </span>
      ))}
    </div>
  );
}

/* ---------- Modals ---------- */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-rise relative w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-ink">{label}</div>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 truncate rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink-soft"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-xl bg-pewter px-3 py-2 text-sm font-semibold text-white"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/// The state of the paid window. Silent while there's plenty of time left,
/// gentle as it approaches, and plain once it's closed — never alarming, and
/// never suggesting anything they wrote is at risk.
function WindowBanner({ ws }: { ws: WorkspaceState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysLeft = ws.daysLeft;
  const closing = !ws.expired && daysLeft !== null && daysLeft <= 21;
  if (!ws.expired && !closing) return null;

  async function extend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "extend", workspaceId: ws.id }),
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
    <div className={`border-b ${ws.expired ? "border-line bg-butter-soft/60" : "border-line bg-card/60"}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="text-sm text-ink-soft">
          {ws.expired ? (
            <>
              <span className="font-display text-base text-pewter">Your window has closed.</span>{" "}
              Everything here is still yours to read — add more time whenever you&apos;re ready.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>{" "}
              in your journey. No rush — you can add more time whenever.
            </>
          )}
          {error && <span className="ml-2 text-sage-deep">{error}</span>}
        </div>
        <button
          onClick={extend}
          disabled={busy}
          className="shrink-0 rounded-full bg-sage-deep px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
        >
          {busy ? "One moment…" : "Add another month"}
        </button>
      </div>
    </div>
  );
}

function WelcomeModal({
  ws,
  inviteUrl,
  familyUrl,
  onClose,
}: {
  ws: WorkspaceState;
  inviteUrl: string;
  familyUrl: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-butter-soft text-2xl">✦</div>
        <h2 className="font-display text-2xl text-ink">Your space is ready</h2>
        <p className="mt-1 text-sm text-ink-soft">
          This is just for the two of you. Invite your partner in so you can name {ws.babyLabel}{" "}
          together.
        </p>
      </div>
      <div className="mt-5 space-y-4">
        {ws.pendingSeat && <InviteByEmail ws={ws} />}
        {inviteUrl && <CopyRow label="Or hand them this link" url={inviteUrl} />}
        <CopyRow label="Ask family & friends for ideas (optional)" url={familyUrl} />
      </div>
      <button onClick={onClose} className="mt-6 w-full rounded-full bg-sage-deep py-3 font-display text-white transition hover:bg-pewter">
        Start naming
      </button>
    </Modal>
  );
}

function ShareModal({
  ws,
  inviteUrl,
  familyUrl,
  onClose,
}: {
  ws: WorkspaceState;
  inviteUrl: string;
  familyUrl: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl text-ink">Share your journey</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {ws.pendingSeat
          ? "One invitation for your partner, one link for your circle."
          : "Both of you are here. Invite your circle to suggest names."}
      </p>
      <div className="mt-5 space-y-4">
        {ws.pendingSeat && <InviteByEmail ws={ws} />}
        {ws.pendingSeat && inviteUrl && <CopyRow label="Or hand them this link" url={inviteUrl} />}
        <CopyRow label="Family & friends suggestion link" url={familyUrl} />
        <Link
          href={`/w/${ws.id}/shower`}
          className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4 transition hover:border-sage"
        >
          <span>
            <span className="block text-sm font-semibold text-ink">Having a shower?</span>
            <span className="mt-0.5 block text-sm text-ink-soft">
              A printable card and sign, so the whole room can suggest names.
            </span>
          </span>
          <span className="ml-3 shrink-0 text-ink-soft">→</span>
        </Link>
      </div>
      <button onClick={onClose} className="mt-6 w-full rounded-full border border-line py-2.5 text-pewter">
        Done
      </button>
    </Modal>
  );
}

// Email the empty seat directly, rather than making someone copy a link into
// their own messages app.
function InviteByEmail({ ws }: { ws: WorkspaceState }) {
  const seat = ws.pendingSeat!;
  const [email, setEmail] = useState(seat.email ?? "");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function send() {
    setError(null);
    if (!email.trim()) {
      setError(`Add ${seatLabel(seat.name)}'s email address.`);
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDevUrl(data.devUrl ?? null);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="text-sm font-semibold text-ink">Invite {seatLabel(seat.name)}</div>
      {state === "sent" ? (
        <div className="mt-2 text-sm text-ink-soft">
          Sent to <span className="font-semibold text-ink">{email.trim()}</span> — their link works
          once and expires in 30 minutes.
          {devUrl && (
            <a href={devUrl} className="mt-2 block font-semibold text-sage-deep hover:text-pewter">
              Dev mode · open their link →
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="them@example.com"
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage"
            />
            <button
              onClick={send}
              disabled={state === "sending"}
              className="shrink-0 rounded-full bg-sage-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-sage-deep">{error}</p>}
        </>
      )}
    </div>
  );
}

function DecideModal({
  ws,
  preselect,
  waiting,
  onClose,
  onDecided,
}: {
  ws: WorkspaceState;
  preselect: string;
  /// The babies still without a name, in order.
  waiting: number[];
  onClose: () => void;
  onDecided: (slot: number) => void;
}) {
  // A name already given to one baby can't be given to the other as well.
  const options = ws.names.filter(
    (n) => n.role !== "middle" && !n.ratings.some((r) => r.veto) && n.chosenSlot === null,
  );
  const middles = ws.names.filter(
    (n) => n.role === "middle" && !n.ratings.some((r) => r.veto),
  );
  const [nameId, setNameId] = useState(preselect || options[0]?.id || "");
  const [slot, setSlot] = useState(waiting[0] ?? 1);
  const [middleId, setMiddleId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const multiple = ws.babyCount > 1;
  const chosenName = options.find((n) => n.id === nameId);
  // What they'd actually be writing on the certificate. The middle from the
  // list wins; otherwise whatever was typed inline beside the first name.
  const middleWord = middles.find((m) => m.id === middleId)?.firstName ?? chosenName?.middleName;
  const fullName = chosenName
    ? [chosenName.firstName, middleWord, chosenName.lastName].filter(Boolean).join(" ")
    : "";
  // The pair check, right where the decision is made: whatever the shortlist
  // noticed about this name beside its sibling, said once more before they
  // commit to it.
  const pairChecks = chosenName?.checks.filter((c) => c.pair) ?? [];

  async function confirm() {
    if (!nameId) return;
    setBusy(true);
    await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: ws.id,
        nameId,
        slot,
        middleId,
        reason: reason.trim() || undefined,
      }),
    });
    onDecided(slot);
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl text-ink">
        {multiple ? `Naming ${slotLabel(slot)}` : "Choosing your name"}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {multiple
          ? "One at a time. Pick this baby's name and tell the story of why — each of them gets their own on the keepsake."
          : "A beautiful moment. Pick the one, and tell the story of why — it becomes your keepsake."}
      </p>

      {multiple && waiting.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {waiting.map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                slot === s
                  ? "border-sage-deep bg-sage-deep text-white"
                  : "border-line bg-paper text-ink-soft hover:border-sage"
              }`}
            >
              {slotLabel(s)}
            </button>
          ))}
        </div>
      )}

      {ws.chosen.length > 0 && (
        <p className="mt-3 rounded-xl bg-butter-soft/70 px-3 py-2 text-xs leading-relaxed text-[#8a6d1f]">
          {ws.chosen.map((c) => `${c.label} is ${c.fullName}`).join(" · ")} — say this one out loud
          beside {ws.chosen.length > 1 ? "them" : "it"} before you decide.
        </p>
      )}

      {options.length === 0 ? (
        <p className="mt-4 rounded-xl bg-paper-2/60 p-4 text-sm text-ink-soft">
          Add a name to your shortlist first — then come back to choose.
        </p>
      ) : (
        <>
          <div className="mt-4 max-h-44 space-y-1.5 overflow-y-auto scroll-soft">
            {options.map((n) => {
              const full = [n.firstName, n.middleName, n.lastName].filter(Boolean).join(" ");
              return (
                <button
                  key={n.id}
                  onClick={() => setNameId(n.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition ${
                    nameId === n.id ? "border-sage bg-butter-soft" : "border-line bg-paper hover:border-sage/50"
                  }`}
                >
                  <span className="font-display text-lg text-ink">{full}</span>
                  {nameId === n.id && <span className="text-sage-deep">✦</span>}
                </button>
              );
            })}
          </div>

          {/* The middle name, chosen with the first rather than after it —
              this is the moment the full name comes into being, and it's the
              only moment it can be read aloud in one piece. */}
          {middles.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-semibold text-ink">
                And the middle name <span className="font-normal text-ink-soft">optional</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {middles.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMiddleId(middleId === m.id ? null : m.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      middleId === m.id
                        ? "border-gold bg-gold text-white"
                        : "border-line bg-paper text-ink-soft hover:border-sage"
                    }`}
                  >
                    {m.firstName}
                  </button>
                ))}
                <button
                  onClick={() => setMiddleId(null)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    middleId === null
                      ? "border-sage-deep bg-sage-deep text-white"
                      : "border-line bg-paper text-ink-soft hover:border-sage"
                  }`}
                >
                  {chosenName?.middleName ? `Keep ${chosenName.middleName}` : "No middle name"}
                </button>
              </div>
            </div>
          )}

          {middles.length === 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Middle names have a list of their own on your shortlist — add a few there and you
              can pick one here.
            </p>
          )}

          {fullName && (
            <p className="mt-4 text-center font-display text-2xl text-pewter">{fullName}</p>
          )}

          {/* Whatever the shortlist noticed about this name beside its
              sibling's, said once more at the moment it matters. */}
          {pairChecks.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-xl bg-paper-2/60 px-3 py-2.5">
              {pairChecks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-snug text-ink-soft">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      c.level === "watch" ? "bg-gold" : "bg-sage"
                    }`}
                  />
                  <span>
                    <span
                      className={`font-semibold ${
                        c.level === "watch" ? "text-[#8a6d1f]" : "text-sage-deep"
                      }`}
                    >
                      {c.title}.
                    </span>{" "}
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              multiple
                ? `Why this name for ${slotLabel(slot)}? (the meaning, the story, the feeling…)`
                : "Why this name? (the meaning, the story, the feeling…)"
            }
            className="mt-4 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-sage"
          />
          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-line py-2.5 text-ink-soft">
              Not yet
            </button>
            <button
              onClick={confirm}
              disabled={busy || !nameId}
              className="flex-1 rounded-full bg-gold py-2.5 font-display text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {busy ? "…" : "It's decided ✦"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
