"use client";

import { useState } from "react";
import type { NameState } from "@/lib/workspace";

type Me = { id: string; name: string; color: string };
type Member = { id: string; name: string; color: string; isOwner: boolean };

const CHECK_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  watch: { dot: "bg-gold", text: "text-[#8a6d1f]", label: "Worth a glance" },
  delight: { dot: "bg-rose", text: "text-rose-deep", label: "A little gift" },
  info: { dot: "bg-sage", text: "text-ink-soft", label: "Note" },
};

function Heart({ filled, onClick, interactive }: { filled: boolean; onClick?: () => void; interactive: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`${interactive ? "cursor-pointer transition hover:scale-110" : "cursor-default"}`}
      aria-label={filled ? "filled heart" : "empty heart"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "var(--rose)" : "none"} stroke="var(--rose)" strokeWidth="1.6">
        <path d="M12 21s-7.5-4.9-9.7-9.2C.9 8.6 2.3 5.5 5.3 5.1c1.9-.2 3.4.8 4.7 2.3 1.3-1.5 2.8-2.5 4.7-2.3 3 .4 4.4 3.5 3 6.7C19.5 16.1 12 21 12 21z" />
      </svg>
    </button>
  );
}

async function post(url: string, body: unknown, method = "POST") {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function NameCard({
  name,
  me,
  members,
  onChanged,
  onChoose,
  decided,
}: {
  name: NameState;
  me: Me;
  members: Member[];
  onChanged: () => void;
  onChoose: (nameId: string) => void;
  decided: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");
  const [showAllChecks, setShowAllChecks] = useState(false);
  const [busy, setBusy] = useState(false);

  const full = [name.firstName, name.middleName, name.lastName].filter(Boolean).join(" ");
  const myRating = name.ratings.find((r) => r.memberId === me.id);
  const vetoedBy = name.ratings.find((r) => r.veto);
  const isChosen = name.status === "chosen";

  const headline =
    name.checks.find((c) => c.level === "watch") ??
    name.checks.find((c) => c.level === "delight") ??
    name.checks[0];

  async function setScore(score: number) {
    setBusy(true);
    await post("/api/ratings", { nameId: name.id, score });
    onChanged();
    setBusy(false);
  }

  async function toggleVeto() {
    setBusy(true);
    const nextVeto = !myRating?.veto;
    let reason: string | null = myRating?.vetoReason ?? null;
    if (nextVeto) {
      reason = window.prompt("A gentle veto. Want to say why? (optional)") || null;
    }
    await post("/api/ratings", { nameId: name.id, veto: nextVeto, vetoReason: reason });
    onChanged();
    setBusy(false);
  }

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    await post("/api/comments", { nameId: name.id, body: comment.trim() });
    setComment("");
    onChanged();
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`Remove ${name.firstName} from your list?`)) return;
    await post(`/api/names/${name.id}`, {}, "DELETE");
    onChanged();
  }

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        isChosen
          ? "border-gold bg-[#fdf6e6] shadow-[0_10px_40px_-20px_rgba(193,154,75,0.6)]"
          : vetoedBy
            ? "border-line bg-paper-2/50 opacity-80"
            : "border-line bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`font-display text-2xl leading-tight ${vetoedBy ? "text-ink-soft line-through decoration-1" : "text-ink"}`}>
            {full}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            {name.meaning && <span>{name.meaning}</span>}
            {name.origin && <span className="text-ink-soft/70">· {name.origin}</span>}
            {name.source === "suggestion" && (
              <span className="rounded-full bg-blush px-2 py-0.5 text-rose-deep">from your circle</span>
            )}
            {isChosen && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-[#8a6d1f]">chosen ✦</span>}
          </div>
        </div>
        {!decided && (
          <button
            onClick={() => onChoose(name.id)}
            className="shrink-0 rounded-full border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-[#8a6d1f] transition hover:bg-gold/20"
          >
            This one ✦
          </button>
        )}
      </div>

      {vetoedBy && (
        <div className="mt-3 rounded-lg bg-blush px-3 py-2 text-xs text-rose-deep">
          Gently set aside by {vetoedBy.member}
          {vetoedBy.vetoReason ? ` — “${vetoedBy.vetoReason}”` : ""}.
        </div>
      )}

      {headline && (
        <button
          onClick={() => setShowAllChecks((s) => !s)}
          className="mt-3 flex w-full items-start gap-2 rounded-lg bg-paper-2/60 px-3 py-2 text-left"
        >
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${CHECK_STYLE[headline.level].dot}`} />
          <span className="text-xs leading-snug text-ink-soft">
            <span className={`font-semibold ${CHECK_STYLE[headline.level].text}`}>{headline.title}.</span>{" "}
            {showAllChecks ? "" : headline.detail}
          </span>
        </button>
      )}
      {showAllChecks && (
        <ul className="mt-2 space-y-1.5">
          {name.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 px-1 text-xs text-ink-soft">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${CHECK_STYLE[c.level].dot}`} />
              <span>
                <span className={`font-semibold ${CHECK_STYLE[c.level].text}`}>{c.title}.</span> {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Ratings — one row per parent */}
      <div className="mt-4 space-y-2">
        {members.map((m) => {
          const r = name.ratings.find((x) => x.memberId === m.id);
          const mine = m.id === me.id;
          return (
            <div key={m.id} className="flex items-center gap-3">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ background: m.color }}
                title={m.name}
              >
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="w-16 shrink-0 truncate text-xs text-ink-soft">{mine ? "You" : m.name}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Heart
                    key={n}
                    filled={(r?.score ?? 0) >= n}
                    interactive={mine && !busy && !decided}
                    onClick={mine ? () => setScore(n === r?.score ? 0 : n) : undefined}
                  />
                ))}
              </div>
              {r?.veto && <span className="text-[11px] text-rose-deep">vetoed</span>}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-xs">
        <button onClick={() => setShowComments((s) => !s)} className="text-ink-soft transition hover:text-plum">
          💬 {name.comments.length > 0 ? `${name.comments.length}` : ""} Notes
        </button>
        {!decided && (
          <button onClick={toggleVeto} disabled={busy} className={`transition ${myRating?.veto ? "text-rose-deep" : "text-ink-soft hover:text-rose-deep"}`}>
            {myRating?.veto ? "↩ Undo veto" : "✕ Veto"}
          </button>
        )}
        {!decided && (
          <button onClick={remove} className="ml-auto text-ink-soft/60 transition hover:text-rose-deep">
            Remove
          </button>
        )}
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          {name.comments.length === 0 && <p className="text-xs text-ink-soft/70">No notes yet.</p>}
          {name.comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-paper-2/50 px-3 py-2 text-xs">
              <span className="font-semibold text-plum">{c.authorName}</span>{" "}
              <span className="text-ink-soft">{c.body}</span>
            </div>
          ))}
          {!decided && (
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder="Add a note for your partner…"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs outline-none focus:border-rose"
              />
              <button onClick={addComment} disabled={busy} className="rounded-lg bg-plum px-3 py-2 text-xs font-semibold text-white">
                Post
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
