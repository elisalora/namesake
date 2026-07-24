"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WorkspaceState } from "@/lib/workspace";
import ChatPanel from "./ChatPanel";
import ShortlistPanel from "./ShortlistPanel";
import SignOutButton from "./SignOutButton";

type Me = { id: string; name: string; color: string };

export default function Dashboard({
  initial,
  me,
  origin,
  inviteToken,
  showWelcome,
}: {
  initial: WorkspaceState;
  me: Me;
  /// Passed down from the server so the share links are correct on first paint
  /// — reading window.location during render isn't pure, and doing it in an
  /// effect meant a flash of empty URLs.
  origin: string;
  inviteToken: string | null;
  showWelcome: boolean;
}) {
  const [ws, setWs] = useState(initial);
  const [welcome, setWelcome] = useState(showWelcome);
  const [share, setShare] = useState(false);
  const [decideOpen, setDecideOpen] = useState<string | null>(null); // preselected nameId
  const [mobileTab, setMobileTab] = useState<"chat" | "list">("chat");
  const [reveal, setReveal] = useState(false);

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
  const chosen = ws.names.find((n) => n.id === ws.chosenNameId);
  // Prefer the live pending seat over the token that came in on the URL, so the
  // invite is still reachable long after the welcome moment has passed.
  const seatToken = ws.pendingSeat?.token ?? inviteToken;
  const inviteUrl = seatToken ? `${origin}/join/${seatToken}` : "";
  const familyUrl = `${origin}/s/${ws.suggestSlug}`;

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="font-display text-xl font-semibold text-plum">
            Namesake
          </Link>
          <div className="hidden items-center gap-2 text-sm text-ink-soft sm:flex">
            <span>Naming</span>
            <span className="font-display text-base text-ink">{ws.babyLabel}</span>
            {ws.lastName && <span>· {ws.lastName}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {ws.members.map((m) => (
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
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-plum transition hover:border-rose"
            >
              Share
            </button>
            <SignOutButton className="hidden sm:inline" />
            {!decided && !ws.expired && (
              <button
                onClick={() => setDecideOpen("")}
                className="rounded-full bg-rose-deep px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-plum"
              >
                Decide together
              </button>
            )}
          </div>
        </div>
      </header>

      <WindowBanner ws={ws} />

      {decided && chosen && (
        <DecidedBanner ws={ws} chosen={chosen} onReopen={refresh} origin={origin} />
      )}

      {/* Mobile segmented control */}
      <div className="mx-auto w-full max-w-7xl px-5 pt-4 lg:hidden">
        <div className="flex rounded-full border border-line bg-card p-1 text-sm">
          {(["chat", "list"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 rounded-full py-2 font-semibold transition ${
                mobileTab === t ? "bg-plum text-white" : "text-ink-soft"
              }`}
            >
              {t === "chat" ? "Consultant" : `Shortlist${ws.names.length ? ` (${ws.names.length})` : ""}`}
            </button>
          ))}
        </div>
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
      {decideOpen !== null && (
        <DecideModal
          ws={ws}
          preselect={decideOpen}
          onClose={() => setDecideOpen(null)}
          onDecided={async () => {
            setDecideOpen(null);
            await refresh();
            setReveal(true);
          }}
        />
      )}
      {reveal && chosen && <RevealOverlay name={chosen} onClose={() => setReveal(false)} />}
    </div>
  );
}

/* Full-screen emotional reveal the moment a name is chosen. */
function RevealOverlay({
  name,
  onClose,
}: {
  name: WorkspaceState["names"][number];
  onClose: () => void;
}) {
  const full = [name.firstName, name.middleName, name.lastName].filter(Boolean).join(" ");
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#fdf6e6] px-6 text-center">
      <Confetti />
      <div className="animate-rise relative">
        <div className="font-display text-sm uppercase tracking-[0.35em] text-gold">Your baby&apos;s name is</div>
        <h1 className="mt-6 font-display text-6xl leading-tight text-plum sm:text-8xl">{full}</h1>
        <div className="mx-auto my-8 flex items-center justify-center gap-3 text-gold">
          <span className="h-px w-16 bg-gold/50" />
          <span className="text-xl">✦</span>
          <span className="h-px w-16 bg-gold/50" />
        </div>
        <p className="text-lg text-ink-soft">Congratulations. What a beautiful choice.</p>
        <button
          onClick={onClose}
          className="mt-8 rounded-full bg-gold px-8 py-3 font-display text-lg text-white transition hover:brightness-95"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ---------- Decided banner + celebration ---------- */

function DecidedBanner({
  ws,
  chosen,
  onReopen,
  origin,
}: {
  ws: WorkspaceState;
  chosen: WorkspaceState["names"][number];
  onReopen: () => void;
  origin: string;
}) {
  const full = [chosen.firstName, chosen.middleName, chosen.lastName].filter(Boolean).join(" ");
  return (
    <div className="relative overflow-hidden border-b border-gold/40 bg-[#fdf6e6]">
      <Confetti />
      <div className="relative mx-auto max-w-7xl px-5 py-6 text-center">
        <div className="text-xs uppercase tracking-widest text-[#8a6d1f]">You chose a name</div>
        <div className="font-display text-4xl text-plum sm:text-5xl">{full}</div>
        {ws.decidedReason && <p className="mx-auto mt-2 max-w-2xl text-ink-soft">“{ws.decidedReason}”</p>}
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
          <button onClick={onReopen} className="rounded-full px-4 py-2.5 text-sm text-ink-soft hover:text-plum">
            Keep exploring
          </button>
        </div>
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
          className="rounded-xl bg-plum px-3 py-2 text-sm font-semibold text-white"
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
    <div className={`border-b ${ws.expired ? "border-line bg-blush/60" : "border-line bg-card/60"}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="text-sm text-ink-soft">
          {ws.expired ? (
            <>
              <span className="font-display text-base text-plum">Your window has closed.</span>{" "}
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
          {error && <span className="ml-2 text-rose-deep">{error}</span>}
        </div>
        <button
          onClick={extend}
          disabled={busy}
          className="shrink-0 rounded-full bg-rose-deep px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-plum disabled:opacity-60"
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
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blush text-2xl">✦</div>
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
      <button onClick={onClose} className="mt-6 w-full rounded-full bg-rose-deep py-3 font-display text-white transition hover:bg-plum">
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
          className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4 transition hover:border-rose"
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
      <button onClick={onClose} className="mt-6 w-full rounded-full border border-line py-2.5 text-plum">
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
      setError(`Add ${seat.name}'s email address.`);
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
      <div className="text-sm font-semibold text-ink">Invite {seat.name}</div>
      {state === "sent" ? (
        <div className="mt-2 text-sm text-ink-soft">
          Sent to <span className="font-semibold text-ink">{email.trim()}</span> — their link works
          once and expires in 30 minutes.
          {devUrl && (
            <a href={devUrl} className="mt-2 block font-semibold text-rose-deep hover:text-plum">
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
              placeholder={`${seat.name.toLowerCase()}@example.com`}
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-rose"
            />
            <button
              onClick={send}
              disabled={state === "sending"}
              className="shrink-0 rounded-full bg-rose-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-plum disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-deep">{error}</p>}
        </>
      )}
    </div>
  );
}

function DecideModal({
  ws,
  preselect,
  onClose,
  onDecided,
}: {
  ws: WorkspaceState;
  preselect: string;
  onClose: () => void;
  onDecided: () => void;
}) {
  const options = ws.names.filter((n) => !n.ratings.some((r) => r.veto));
  const [nameId, setNameId] = useState(preselect || options[0]?.id || "");
  const [reason, setReason] = useState(ws.decidedReason || "");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!nameId) return;
    setBusy(true);
    await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: ws.id, nameId, reason: reason.trim() || undefined }),
    });
    onDecided();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="font-display text-2xl text-ink">Choosing your name</h2>
      <p className="mt-1 text-sm text-ink-soft">
        A beautiful moment. Pick the one, and tell the story of why — it becomes your keepsake.
      </p>

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
                    nameId === n.id ? "border-rose bg-blush" : "border-line bg-paper hover:border-rose/50"
                  }`}
                >
                  <span className="font-display text-lg text-ink">{full}</span>
                  {nameId === n.id && <span className="text-rose-deep">✦</span>}
                </button>
              );
            })}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why this name? (the meaning, the story, the feeling…)"
            className="mt-4 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-rose"
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
