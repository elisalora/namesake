"use client";

import { useState } from "react";

// One form, three doorways: signing back in, claiming an invited seat, or
// (via `onSubmit`) starting a brand-new journey. All of them end the same way —
// a link in your inbox — so they share the same "check your email" moment.
export default function EmailLinkForm({
  seatToken,
  returnTo,
  defaultEmail = "",
  cta = "Email me a link",
  placeholder = "you@example.com",
}: {
  seatToken?: string;
  /// Where to land after signing in — used to bring someone back to a gift.
  returnTo?: string;
  defaultEmail?: string;
  cta?: string;
  placeholder?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Add your email address and we'll send you a link.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), seatToken, returnTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setDevUrl(data.devUrl ?? null);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return <CheckYourEmail email={email.trim()} devUrl={devUrl} />;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Your email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          autoComplete="email"
          className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-sage focus:bg-card"
        />
      </label>

      {error && <p className="text-sm text-sage-deep">{error}</p>}

      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-full bg-sage-deep py-3.5 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : cta}
      </button>
      <p className="text-center text-xs text-ink-soft">
        No passwords, ever. We&apos;ll email you a link that signs you straight in.
      </p>
    </form>
  );
}

export function CheckYourEmail({ email, devUrl }: { email: string; devUrl: string | null }) {
  return (
    <div className="animate-rise text-center">
      <div className="text-4xl">💌</div>
      <div className="mt-3 font-display text-2xl text-pewter">Check your email</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        We sent a link to <span className="font-semibold text-ink">{email}</span>. Tap it and
        you&apos;re in — it works once, and expires in 30 minutes.
      </p>

      {devUrl && (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-paper p-4 text-left">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Dev mode · no mail provider configured
          </div>
          <a
            href={devUrl}
            className="mt-2 inline-block rounded-full bg-pewter px-5 py-2.5 font-display text-white transition hover:bg-sage-deep"
          >
            Open the link →
          </a>
        </div>
      )}
    </div>
  );
}
