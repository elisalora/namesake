"use client";

import { useState } from "react";

// Shown when your own seat is still unnamed — which happens if your partner
// set the journey up without naming you and you joined by link.
//
// It isn't decoration: an unnamed seat is left out of the line family and
// friends see on the suggestion page, so "Help Mia name Pip" quietly omits the
// other parent until this is filled in.
export default function NameYourself({
  workspaceId,
  onChanged,
}: {
  workspaceId: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/members/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't save that.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line bg-butter-soft/60">
      <form
        onSubmit={save}
        className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-3"
      >
        <span className="text-sm text-ink-soft">
          <span className="font-display text-base text-pewter">What should we call you?</span>{" "}
          Your name goes on the shortlist and on the link you share with family.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sam"
            className="w-32 rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none transition focus:border-sage"
          />
          <button
            disabled={busy || !name.trim()}
            className="shrink-0 rounded-full bg-sage-deep px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
          >
            {busy ? "…" : "Save"}
          </button>
        </span>
        {error && <span className="w-full text-sm text-sage-deep">{error}</span>}
      </form>
    </div>
  );
}
