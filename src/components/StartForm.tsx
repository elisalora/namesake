"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import ExpectingChoice, { type Expecting } from "./ExpectingChoice";
import MultiplesChoice from "./MultiplesChoice";
import { FUNNEL } from "@/lib/funnel";

export default function StartForm({ priceLabel }: { priceLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    you: "",
    youEmail: "",
    partner: "",
    partnerEmail: "",
    babyLabel: "",
    lastName: "",
  });
  const [babyCount, setBabyCount] = useState(1);
  const [expecting, setExpecting] = useState<Expecting | "">("");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.you.trim()) {
      setError("Add your first name to begin.");
      return;
    }
    if (!form.youEmail.trim()) {
      setError("We'll need your email to send you the journey.");
      return;
    }
    setLoading(true);
    // Step two, counted here rather than on the button's click: a submit that
    // never got past the two checks above isn't an attempt to buy, it's a
    // half-filled form. Counting those would make the drop-off to step three
    // look like a payment problem when it was a typo.
    track(FUNNEL.startSubmit, { tier: "self_serve", babyCount });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "journey",
          tier: "self_serve",
          draft: {
            you: { name: form.you.trim(), email: form.youEmail.trim() },
            partner: { name: form.partner.trim(), email: form.partnerEmail.trim() },
            babyLabel: form.babyLabel.trim(),
            lastName: form.lastName.trim(),
            babyCount,
            expecting: expecting || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      // Off to Checkout. The journey itself is created when the payment clears.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your first name" value={form.you} onChange={(v) => set("you", v)} placeholder="Alex" />
        <Field
          label="Partner's first name"
          hint="optional"
          value={form.partner}
          onChange={(v) => set("partner", v)}
          placeholder="Sam"
        />
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
          label={babyCount > 1 ? "What you call them" : "What you call the bump"}
          hint="optional"
          value={form.babyLabel}
          onChange={(v) => set("babyLabel", v)}
          placeholder={babyCount > 1 ? "The Beans" : "Peanut"}
        />
      </div>

      <MultiplesChoice
        value={babyCount}
        onChange={(n) => {
          setBabyCount(n);
          // "One of each" can't survive a change back to one baby.
          if (n === 1 && expecting === "mixed") setExpecting("");
        }}
      />

      <ExpectingChoice value={expecting} onChange={setExpecting} babyCount={babyCount} />

      {error && <p className="text-sm text-sage-deep">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-sage-deep py-3.5 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-60"
      >
        {loading ? "Taking you to checkout…" : `Begin the journey · ${priceLabel}`}
      </button>
      <p className="text-center text-xs leading-relaxed text-ink-soft">
        Paid once — no subscription, nothing to cancel. You can add more time later if you need
        it, and it&apos;s{" "}
        <a href="/refunds" className="underline underline-offset-2 hover:text-sage-deep">
          refundable
        </a>{" "}
        for fourteen days.
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
        className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage focus:bg-card"
      />
    </label>
  );
}
