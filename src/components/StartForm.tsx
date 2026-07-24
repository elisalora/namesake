"use client";

import { useState } from "react";
import { CheckYourEmail } from "@/components/EmailLinkForm";

export default function StartForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    you: "",
    youEmail: "",
    partner: "",
    partnerEmail: "",
    babyLabel: "",
    lastName: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.you.trim() || !form.partner.trim()) {
      setError("Add both of your first names to begin.");
      return;
    }
    if (!form.youEmail.trim()) {
      setError("We'll need your email to send you the journey.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          you: { name: form.you.trim(), email: form.youEmail.trim() },
          partner: { name: form.partner.trim(), email: form.partnerEmail.trim() },
          babyLabel: form.babyLabel.trim(),
          lastName: form.lastName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDevUrl(data.devUrl ?? null);
      setSentTo(data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  if (sentTo) return <CheckYourEmail email={sentTo} devUrl={devUrl} />;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your first name" value={form.you} onChange={(v) => set("you", v)} placeholder="Alex" />
        <Field label="Partner's first name" value={form.partner} onChange={(v) => set("partner", v)} placeholder="Sam" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Your email"
          type="email"
          autoComplete="email"
          value={form.youEmail}
          onChange={(v) => set("youEmail", v)}
          placeholder="alex@example.com"
        />
        <Field
          label="Partner's email"
          hint="optional"
          type="email"
          value={form.partnerEmail}
          onChange={(v) => set("partnerEmail", v)}
          placeholder="sam@example.com"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Family surname"
          hint="optional"
          value={form.lastName}
          onChange={(v) => set("lastName", v)}
          placeholder="Rivera"
        />
        <Field
          label="What you call the bump"
          hint="optional"
          value={form.babyLabel}
          onChange={(v) => set("babyLabel", v)}
          placeholder="Peanut"
        />
      </div>

      {error && <p className="text-sm text-rose-deep">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-rose-deep py-3.5 font-display text-lg text-white transition hover:bg-plum disabled:opacity-60"
      >
        {loading ? "Preparing your space…" : "Begin the journey"}
      </button>
      <p className="text-center text-xs text-ink-soft">
        No passwords. We&apos;ll email you a link to open your journey — and invite your partner in,
        if you added their address.
      </p>
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
  autoComplete,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-rose focus:bg-card"
      />
    </label>
  );
}
