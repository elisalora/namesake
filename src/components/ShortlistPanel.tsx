"use client";

import { useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import NameCard from "./NameCard";

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
  const decided = ws.status === "decided";

  const pending = ws.suggestions.filter((s) => s.status === "pending");

  // Sort: chosen first, then by combined hearts desc, vetoed sink to bottom.
  const names = [...ws.names].sort((a, b) => {
    if (a.status === "chosen") return -1;
    if (b.status === "chosen") return 1;
    const av = a.ratings.some((r) => r.veto) ? 1 : 0;
    const bv = b.ratings.some((r) => r.veto) ? 1 : 0;
    if (av !== bv) return av - bv;
    const sum = (n: typeof a) => n.ratings.reduce((t, r) => t + r.score, 0);
    return sum(b) - sum(a);
  });

  async function addName(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) return;
    setAdding(true);
    const res = await post("/api/names", {
      workspaceId: ws.id,
      firstName: first.trim(),
      middleName: middle.trim() || undefined,
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
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-ink">Your shortlist</h2>
        <span className="text-sm text-ink-soft">
          {ws.names.length} {ws.names.length === 1 ? "name" : "names"}
        </span>
      </div>

      {!decided && (
        <form onSubmit={addName} className="mb-4 flex gap-2">
          <input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder="Add a name…"
            className="flex-1 rounded-xl border border-line bg-card px-3.5 py-2.5 outline-none focus:border-rose"
          />
          <input
            value={middle}
            onChange={(e) => setMiddle(e.target.value)}
            placeholder="middle (optional)"
            className="w-32 rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-rose"
          />
          <button disabled={adding} className="rounded-xl bg-rose-deep px-4 font-semibold text-white transition hover:bg-plum">
            Add
          </button>
        </form>
      )}

      {/* Suggestions inbox */}
      {pending.length > 0 && (
        <div className="mb-4 rounded-2xl border border-rose/40 bg-blush/50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-lg text-rose-deep">From your circle</span>
            <span className="rounded-full bg-rose-deep px-2 py-0.5 text-xs font-bold text-white">{pending.length}</span>
          </div>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl bg-card/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-display text-lg text-ink">{s.suggestedName}</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => importSuggestion(s)}
                      className="rounded-full bg-rose-deep px-3 py-1 text-xs font-semibold text-white transition hover:bg-plum"
                    >
                      Add to list
                    </button>
                    <button onClick={() => dismissSuggestion(s.id)} className="rounded-full px-2 py-1 text-xs text-ink-soft hover:text-rose-deep">
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  <span className="font-semibold text-plum">{s.suggesterName}</span>
                  {s.relationship ? ` · ${s.relationship}` : ""}
                  {s.reason ? ` — “${s.reason}”` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3">
        {names.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center text-ink-soft">
            <p className="font-display text-lg text-plum">No names yet</p>
            <p className="mt-1 text-sm">
              Add one above, or ask the consultant for ideas — anything you save lands here for
              the two of you to weigh together.
            </p>
          </div>
        )}
        {names.map((n) => (
          <NameCard key={n.id} name={n} me={me} members={ws.members} onChanged={onChanged} onChoose={onChoose} decided={decided} />
        ))}
      </div>
    </div>
  );
}
