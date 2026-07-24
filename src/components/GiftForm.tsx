"use client";

import { useState } from "react";

type TierView = {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  price: string;
  window: string;
  physical: boolean;
  boxContents: string[];
  featured: boolean;
};

type AddOnView = { id: string; name: string; blurb: string; price: string };

export default function GiftForm({
  tiers,
  addOns,
}: {
  tiers: TierView[];
  addOns: AddOnView[];
}) {
  const [tierId, setTierId] = useState(tiers.find((t) => t.featured)?.id ?? tiers[0].id);
  const [chosenAddOns, setChosenAddOns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    purchaserName: "",
    purchaserEmail: "",
    recipientEmail: "",
    giftMessage: "",
  });

  const tier = tiers.find((t) => t.id === tierId)!;

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleAddOn(id: string) {
    setChosenAddOns((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.purchaserName.trim() || !form.purchaserEmail.trim()) {
      setError("We need your name and email — so they know who it's from, and you get a receipt.");
      return;
    }
    // A digital gift has no card to carry the link, so it has to be emailed.
    if (!tier.physical && !form.recipientEmail.trim()) {
      setError(`${tier.name} arrives by email, so we'll need their address.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "gift",
          tier: tierId,
          purchaserName: form.purchaserName.trim(),
          purchaserEmail: form.purchaserEmail.trim(),
          recipientEmail: form.recipientEmail.trim(),
          giftMessage: form.giftMessage.trim(),
          addOns: chosenAddOns,
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
    <form onSubmit={submit}>
      {/* Tiers. Bloom sits in the middle and is visually heaviest — it's the
          one the ladder is built to sell. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map((t) => {
          const selected = t.id === tierId;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => setTierId(t.id)}
              className={`relative rounded-3xl border p-6 text-left transition ${
                selected
                  ? "border-rose-deep bg-card shadow-[0_20px_60px_-30px_rgba(111,77,107,0.5)]"
                  : "border-line bg-card/60 hover:border-rose"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-rose-deep px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Most given
                </span>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-2xl text-ink">{t.name}</span>
                <span className="font-display text-xl text-plum">{t.price}</span>
              </div>
              <div className="mt-0.5 text-sm font-semibold text-rose-deep">{t.tagline}</div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t.blurb}</p>

              <div className="mt-4 border-t border-line pt-3 text-xs uppercase tracking-wide text-ink-soft">
                {t.window}
                {t.physical ? " · arrives in a box" : " · arrives by email"}
              </div>

              {t.boxContents.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {t.boxContents.map((c) => (
                    <li key={c} className="flex gap-2 text-sm text-ink-soft">
                      <span aria-hidden className="text-rose-deep">
                        ·
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <section>
          <h2 className="font-display text-2xl text-ink">Make it a complete gift</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Optional keepsakes, made once the name is chosen and sent on to them.
          </p>
          <div className="space-y-2">
            {addOns.map((a) => {
              const on = chosenAddOns.includes(a.id);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => toggleAddOn(a.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    on ? "border-rose-deep bg-card" : "border-line bg-card/60 hover:border-rose"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs ${
                      on ? "border-rose-deep bg-rose-deep text-white" : "border-line"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{a.name}</span>
                      <span className="text-sm text-plum">+{a.price}</span>
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-ink-soft">
                      {a.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
          <h2 className="font-display text-2xl text-ink">Send it</h2>
          <p className="mb-5 mt-1 text-sm text-ink-soft">
            {tier.physical
              ? "We'll post the box to you, so you can hand it over yourself."
              : "We'll email it straight to them."}
          </p>

          <div className="space-y-4">
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

            <Field
              label="Their email"
              hint={tier.physical ? "optional — the card carries their link" : undefined}
              type="email"
              value={form.recipientEmail}
              onChange={(v) => set("recipientEmail", v)}
              placeholder="parents@example.com"
            />

            <label className="block">
              <span className="mb-1 flex items-baseline gap-1.5 text-sm font-semibold text-ink">
                A note
                <span className="text-xs font-normal text-ink-soft">
                  {tier.physical ? "goes on the card" : "optional"}
                </span>
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
          </div>

          {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-full bg-rose-deep py-3.5 font-display text-lg text-white transition hover:bg-plum disabled:opacity-60"
          >
            {loading ? "Taking you to checkout…" : `Give ${tier.name}`}
          </button>
          <p className="mt-2 text-center text-xs leading-relaxed text-ink-soft">
            Paid once — no subscription for them to cancel.
            {tier.physical ? " We'll ask where to post it at checkout." : ""}
          </p>
        </section>
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
