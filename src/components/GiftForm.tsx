"use client";

import { useState } from "react";

export default function GiftForm({ priceLabel }: { priceLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    purchaserName: "",
    purchaserEmail: "",
    recipientEmail: "",
    giftMessage: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.purchaserName.trim()) {
      setError("Add your name so they know who it's from.");
      return;
    }
    if (!form.recipientEmail.trim() || !form.purchaserEmail.trim()) {
      setError("We need both email addresses — theirs and yours.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "gift",
          purchaserName: form.purchaserName.trim(),
          purchaserEmail: form.purchaserEmail.trim(),
          recipientEmail: form.recipientEmail.trim(),
          giftMessage: form.giftMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Their email"
        type="email"
        value={form.recipientEmail}
        onChange={(v) => set("recipientEmail", v)}
        placeholder="parents@example.com"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Your name"
          value={form.purchaserName}
          onChange={(v) => set("purchaserName", v)}
          placeholder="Rose"
        />
        <Field
          label="Your email"
          type="email"
          autoComplete="email"
          value={form.purchaserEmail}
          onChange={(v) => set("purchaserEmail", v)}
          placeholder="you@example.com"
        />
      </div>

      <label className="block">
        <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
          A note
          <span className="text-xs font-normal text-ink-soft">optional</span>
        </span>
        <textarea
          value={form.giftMessage}
          onChange={(e) => set("giftMessage", e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Thinking of you both. Can't wait to meet them."
          className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-rose focus:bg-card"
        />
      </label>

      {error && <p className="text-sm text-rose-deep">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-rose-deep py-3.5 font-display text-lg text-white transition hover:bg-plum disabled:opacity-60"
      >
        {loading ? "Taking you to checkout…" : `Send the gift · ${priceLabel}`}
      </button>
      <p className="text-center text-xs leading-relaxed text-ink-soft">
        We&apos;ll email them a link as soon as your payment goes through. Your receipt goes to you.
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
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
