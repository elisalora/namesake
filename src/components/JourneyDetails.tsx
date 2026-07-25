"use client";

import { useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import ExpectingChoice, { type Expecting } from "./ExpectingChoice";

// Editing what was asked at the very start. Most of it was optional then, and
// some of it wasn't known yet — a surname still being decided, a nickname that
// hadn't stuck, a scan that hadn't happened.
export default function JourneyDetails({
  ws,
  onSaved,
  onClose,
}: {
  ws: WorkspaceState;
  onSaved: (next: WorkspaceState) => void;
  onClose: () => void;
}) {
  const [babyLabel, setBabyLabel] = useState(ws.babyLabel === "Baby" ? "" : ws.babyLabel);
  const [lastName, setLastName] = useState(ws.lastName ?? "");
  const [dueDate, setDueDate] = useState(ws.dueDate ? ws.dueDate.slice(0, 10) : "");
  const [expecting, setExpecting] = useState<Expecting | "">(
    (ws.expecting as Expecting | null) ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${ws.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          babyLabel: babyLabel.trim(),
          lastName: lastName.trim(),
          dueDate,
          expecting: expecting || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that.");
      onSaved(data.workspace);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="What you call the bump"
          hint="optional"
          value={babyLabel}
          onChange={setBabyLabel}
          placeholder="Peanut"
        />
        <Field
          label="Family surname"
          hint="used for the checks"
          value={lastName}
          onChange={setLastName}
          placeholder="Rivera"
        />
      </div>

      <Field label="Due date" hint="optional" type="date" value={dueDate} onChange={setDueDate} />

      <ExpectingChoice value={expecting} onChange={setExpecting} />

      <p className="text-xs leading-relaxed text-ink-soft">
        Changing the due date won&apos;t shorten or extend the time you&apos;ve paid for — that
        stays exactly as it was.
      </p>

      {error && <p className="text-sm text-sage-deep">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-full bg-sage-deep py-3 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-line px-6 py-3 text-pewter transition hover:border-sage"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage focus:bg-card"
      />
    </label>
  );
}
