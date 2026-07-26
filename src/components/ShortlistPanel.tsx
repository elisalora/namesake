"use client";

import { useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import NameCard from "./NameCard";
import { normalizeGender } from "./GenderMark";

type GenderFilter = "all" | "girl" | "boy" | "neutral";

type Me = { id: string; name: string; color: string };

async function post(url: string, body: unknown, method = "POST") {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function ShortlistPanel({
  ws,
  me,
  onChanged,
  onChoose,
}: {
  ws: WorkspaceState;
  me: Me;
  onChanged: () => void;
  onChoose: (nameId: string) => void;
}) {
  const [first, setFirst] = useState("");
  const [middle, setMiddle] = useState("");
  const [adding, setAdding] = useState(false);
  // Which list is on screen. A middle name is chosen against a first name
  // rather than instead of one, so the two lists are the same shortlist seen
  // from two sides rather than two competing places to put a name.
  const [list, setList] = useState<"first" | "middle">("first");
  const decided = ws.status === "decided";
  const middles = ws.names.filter((n) => n.role === "middle");

  const pending = ws.suggestions.filter((s) => s.status === "pending");

  // Default the filter to what they're expecting, so someone having a girl
  // isn't scrolling past boys' names from the first visit. "surprise" and an
  // unanswered question both start on everything.
  const [filter, setFilter] = useState<GenderFilter>(
    ws.expecting === "girl" || ws.expecting === "boy" ? ws.expecting : "all",
  );

  // Sort: chosen first, then by combined hearts desc, vetoed sink to bottom.
  const sorted = [...ws.names.filter((n) => n.role !== "middle")].sort((a, b) => {
    if (a.status === "chosen") return -1;
    if (b.status === "chosen") return 1;
    const av = a.ratings.some((r) => r.veto) ? 1 : 0;
    const bv = b.ratings.some((r) => r.veto) ? 1 : 0;
    if (av !== bv) return av - bv;
    const sum = (n: typeof a) => n.ratings.reduce((t, r) => t + r.score, 0);
    return sum(b) - sum(a);
  });

  const heartsOn = (n: WorkspaceState["names"][number]) =>
    n.ratings.reduce((t, r) => t + r.score, 0);
  const sortedMiddles = [...middles].sort((a, b) => {
    if (a.chosenSlot !== null) return -1;
    if (b.chosenSlot !== null) return 1;
    const av = a.ratings.some((r) => r.veto) ? 1 : 0;
    const bv = b.ratings.some((r) => r.veto) ? 1 : 0;
    if (av !== bv) return av - bv;
    return heartsOn(b) - heartsOn(a);
  });

  // A name we've never classified stays visible under every filter — better to
  // show a name they saved than to hide it behind a guess we never made.
  const names = sorted.filter((n) => {
    if (filter === "all") return true;
    const g = normalizeGender(n.gender);
    return g === null || g === filter || g === "neutral";
  });

  const counts = {
    all: sorted.length,
    girl: sorted.filter((n) => normalizeGender(n.gender) === "girl").length,
    boy: sorted.filter((n) => normalizeGender(n.gender) === "boy").length,
    neutral: sorted.filter((n) => normalizeGender(n.gender) === "neutral").length,
  };

  async function addName(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) return;
    setAdding(true);
    const res = await post("/api/names", {
      workspaceId: ws.id,
      role: list,
      firstName: first.trim(),
      middleName: list === "middle" ? undefined : middle.trim() || undefined,
      source: "parent",
    });
    setFirst("");
    setMiddle("");
    onChanged();
    setAdding(false);
    enrich(res);
  }

  // Fill in meaning/origin in the background, then refresh so it appears.
  async function enrich(res: Response) {
    try {
      const { id } = await res.clone().json();
      if (!id) return;
      await fetch(`/api/names/${id}/enrich`, { method: "POST" });
      onChanged();
    } catch {
      /* enrichment is best-effort */
    }
  }

  async function importSuggestion(s: WorkspaceState["suggestions"][number]) {
    const who = [s.suggesterName, s.relationship ? `(${s.relationship})` : ""].filter(Boolean).join(" ");
    const res = await post("/api/names", {
      workspaceId: ws.id,
      firstName: s.suggestedName,
      source: "suggestion",
      suggestionId: s.id,
      seedComment: s.reason ? { authorName: who, body: s.reason } : undefined,
    });
    onChanged();
    enrich(res);
  }

  async function dismissSuggestion(id: string) {
    await post(`/api/suggestions/${id}`, { status: "dismissed" });
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-ink">Your shortlist</h2>
        <span className="text-sm text-ink-soft">
          {sorted.length} {sorted.length === 1 ? "name" : "names"}
        </span>
      </div>

      {/* The two halves of a name. Middle names get their own list rather than
          a second field on every card, because they're weighed on their own —
          hearts, a note, a veto — and only ever against a first name. */}
      <div className="mb-4 flex rounded-full border border-line bg-card p-1 text-sm">
        {(
          [
            ["first", "First names", sorted.length],
            ["middle", "Middle names", middles.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setList(key)}
            className={`flex-1 rounded-full py-1.5 font-semibold transition ${
              list === key ? "bg-pewter text-white" : "text-ink-soft hover:text-pewter"
            }`}
          >
            {label}
            {count > 0 && <span className="ml-1.5 opacity-70">{count}</span>}
          </button>
        ))}
      </div>

      {!decided && !ws.expired && (
        <form onSubmit={addName} className="mb-4 flex gap-2">
          <input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder={list === "middle" ? "Add a middle name…" : "Add a name…"}
            className="flex-1 rounded-xl border border-line bg-card px-3.5 py-2.5 outline-none focus:border-sage"
          />
          {list === "first" && (
            <input
              value={middle}
              onChange={(e) => setMiddle(e.target.value)}
              placeholder="middle (optional)"
              className="w-32 rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-sage"
            />
          )}
          <button disabled={adding} className="rounded-xl bg-sage-deep px-4 font-semibold text-white transition hover:bg-pewter">
            Add
          </button>
        </form>
      )}

      {/* Suggestions inbox */}
      {pending.length > 0 && (
        <div className="mb-4 rounded-2xl border border-sage/40 bg-butter-soft/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-lg text-sage-deep">From your circle</span>
            <span className="rounded-full bg-sage-deep px-2 py-0.5 text-xs font-bold text-white">{pending.length}</span>
          </div>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl bg-card/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-lg text-ink">{s.suggestedName}</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => importSuggestion(s)}
                      className="rounded-full bg-sage-deep px-3 py-1 text-xs font-semibold text-white transition hover:bg-pewter"
                    >
                      Add to list
                    </button>
                    <button onClick={() => dismissSuggestion(s.id)} className="rounded-full px-2 py-1 text-xs text-ink-soft hover:text-sage-deep">
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  <span className="font-semibold text-pewter">{s.suggesterName}</span>
                  {s.relationship ? ` · ${s.relationship}` : ""}
                  {s.reason ? ` — “${s.reason}”` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {list === "first" && sorted.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", "All"],
              ["girl", "Girls"],
              ["boy", "Boys"],
              ["neutral", "Either"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                filter === key
                  ? "border-sage-deep bg-sage-deep text-white"
                  : "border-line bg-card text-ink-soft hover:border-sage"
              }`}
            >
              {label}
              <span className={filter === key ? "ml-1.5 opacity-70" : "ml-1.5 text-ink-soft/60"}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3">
        {list === "middle" ? (
          <>
            {sortedMiddles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center text-ink-soft">
                <p className="font-display text-lg text-pewter">No middle names yet</p>
                <p className="mt-1 text-sm">
                  Add one above, or ask the consultant — this is where a grandmother, a maiden
                  name, or the one you love but can&apos;t quite put first tends to live. Each one
                  is shown against your leading first name so you can hear the whole thing.
                </p>
              </div>
            ) : (
              sortedMiddles.map((n) => (
                <NameCard
                  key={n.id}
                  name={n}
                  me={me}
                  members={ws.members}
                  onChanged={onChanged}
                  onChoose={onChoose}
                  decided={decided}
                  babyCount={ws.babyCount}
                  workspaceId={ws.id}
                  chosen={ws.chosen}
                />
              ))
            )}
          </>
        ) : (
          <>
        {sorted.length > 0 && names.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center text-ink-soft">
            <p className="text-sm">Nothing on your list leans that way yet.</p>
          </div>
        )}
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center text-ink-soft">
            <p className="font-display text-lg text-pewter">No names yet</p>
            <p className="mt-1 text-sm">
              Add one above, or ask the consultant for ideas — anything you save lands here for
              the two of you to weigh together.
            </p>
          </div>
        )}
        {names.map((n) => (
          <NameCard
            key={n.id}
            name={n}
            me={me}
            members={ws.members}
            onChanged={onChanged}
            onChoose={onChoose}
            decided={decided}
            babyCount={ws.babyCount}
            workspaceId={ws.id}
            chosen={ws.chosen}
          />
        ))}
          </>
        )}
      </div>
    </div>
  );
}
