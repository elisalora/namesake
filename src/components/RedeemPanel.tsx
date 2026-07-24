"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  code: string;
  needsDetails: boolean;
  awaitingPayment: boolean;
  signedInAs: string;
  months: number;
  giftFrom?: string | null;
  giftMessage?: string | null;
};

export default function RedeemPanel({
  code,
  needsDetails,
  awaitingPayment,
  signedInAs,
  months,
  giftFrom,
  giftMessage,
}: Props) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(awaitingPayment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    you: "",
    partner: "",
    partnerEmail: "",
    babyLabel: "",
    lastName: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Stripe redirects the browser the moment payment succeeds, which can beat
  // the webhook that actually marks it paid. Poll rather than make them refresh.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/redeem?code=${encodeURIComponent(code)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status !== "pending") setWaiting(false);
    }, 2000);
    return () => clearInterval(timer);
  }, [waiting, code]);

  const claim = useCallback(async () => {
    setError(null);
    if (needsDetails) {
      if (!form.you.trim() || !form.partner.trim()) {
        setError("Add both of your first names to begin.");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          details: needsDetails
            ? {
                you: { name: form.you.trim(), email: signedInAs },
                partner: { name: form.partner.trim(), email: form.partnerEmail.trim() },
                babyLabel: form.babyLabel.trim(),
                lastName: form.lastName.trim(),
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      router.push(
        `/w/${data.workspaceId}?welcome=1${data.inviteToken ? `&invite=${data.inviteToken}` : ""}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }, [code, form, needsDetails, router, signedInAs]);

  if (waiting) {
    return (
      <div className="text-center">
        <div className="text-4xl">⏳</div>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Just confirming your payment — this takes a second. The page will move on by itself.
        </p>
      </div>
    );
  }

  return (
    <div>
      {giftFrom && (
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{giftFrom}</span> gave you {months} months of
          Namesake.
        </p>
      )}
      {giftMessage && (
        <blockquote className="mt-3 border-l-2 border-line pl-4 text-sm italic leading-relaxed text-ink-soft">
          {giftMessage}
        </blockquote>
      )}

      {needsDetails ? (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Tell us a little about the two of you, and we&apos;ll open your space.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your first name" value={form.you} onChange={(v) => set("you", v)} placeholder="Alex" />
            <Field
              label="Partner's first name"
              value={form.partner}
              onChange={(v) => set("partner", v)}
              placeholder="Sam"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Partner's email"
              hint="optional"
              type="email"
              value={form.partnerEmail}
              onChange={(v) => set("partnerEmail", v)}
              placeholder="sam@example.com"
            />
            <Field
              label="Family surname"
              hint="optional"
              value={form.lastName}
              onChange={(v) => set("lastName", v)}
              placeholder="Rivera"
            />
          </div>
          <Field
            label="What you call the bump"
            hint="optional"
            value={form.babyLabel}
            onChange={(v) => set("babyLabel", v)}
            placeholder="Peanut"
          />
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Everything&apos;s paid for — {months} months, starting the moment you open it.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-rose-deep">{error}</p>}

      <button
        onClick={claim}
        disabled={busy}
        className="mt-6 w-full rounded-full bg-rose-deep py-3.5 font-display text-lg text-white transition hover:bg-plum disabled:opacity-60"
      >
        {busy ? "Opening your space…" : needsDetails ? "Open our journey" : "Begin the journey"}
      </button>
      <p className="mt-2 text-center text-xs text-ink-soft">Signed in as {signedInAs}</p>
    </div>
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
        className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-rose focus:bg-card"
      />
    </label>
  );
}
