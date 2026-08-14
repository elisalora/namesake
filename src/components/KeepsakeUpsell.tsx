"use client";

import { useEffect, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace";
import { ADD_ONS, ADD_ONS_FOR_SALE, formatPrice, type AddOnId } from "@/lib/pricing";

// The keepsakes offered at the decision moment, in the order they're shown.
// Each is made-to-order with the chosen name, so they only appear here — once
// there's actually a name to put on them.
//
// Currently empty, because nothing physical is on sale, and this whole section
// disappears rather than offering something nobody can make. It is the riskiest
// place in the product to sell an obligation: it fires at the moment a paying
// customer likes us most.
const KEEPSAKES: AddOnId[] = ADD_ONS_FOR_SALE;

export default function KeepsakeUpsell({ ws }: { ws: WorkspaceState }) {
  // key = `${slot}::${addOn}` — one selection per baby per keepsake.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("keepsake") === "thanks") {
      setThanks(true);
      // Tidy the URL so a refresh doesn't keep showing the thank-you.
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const twins = ws.chosen.length > 1;

  function toggle(slot: number, addOn: AddOnId) {
    const key = `${slot}::${addOn}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const lines = [...selected].map((k) => {
    const [slot, addOn] = k.split("::");
    return { slot: Number(slot), addOn: addOn as AddOnId };
  });
  const total = lines.reduce((sum, l) => sum + ADD_ONS[l.addOn].amountCents, 0);

  async function order() {
    if (lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keepsake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id, lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (thanks) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pt-5">
        <div className="animate-rise rounded-3xl border border-butter/60 bg-butter-soft/50 p-6 text-center">
          <div className="mb-2 text-2xl">✦</div>
          <h3 className="font-display text-2xl text-pewter">It&apos;s being made.</h3>
          <p className="mt-1 text-ink-soft">
            Thank you — your keepsake is on its way, carrying the name you chose. We&apos;ve emailed
            your receipt.
          </p>
        </div>
      </div>
    );
  }

  // After the thank-you, so anyone returning from an order placed before this
  // shipped still sees it confirmed rather than nothing at all.
  if (KEEPSAKES.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-5 pt-5">
      <div className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <div className="text-center">
          <div className="engraved">Make it something they&apos;ll keep</div>
          <h3 className="mt-2 font-display text-2xl text-pewter sm:text-3xl">
            {twins ? "One for each of them" : "Hold the name in your hands"}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">
            {twins
              ? "The name is decided — now it can be embroidered, framed, and sent. Choose a keepsake for each little one."
              : "The name is decided. Let us make it real — embroidered or framed, with their name on it."}
          </p>
        </div>

        <div className="mt-6 space-y-5">
          {ws.chosen.map((baby) => (
            <div key={baby.slot}>
              {twins && (
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="engraved">{baby.label}</span>
                  <span className="font-display text-lg text-ink">{baby.fullName}</span>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {KEEPSAKES.map((id) => {
                  const a = ADD_ONS[id];
                  const key = `${baby.slot}::${id}`;
                  const on = selected.has(key);
                  return (
                    <button
                      key={id}
                      onClick={() => toggle(baby.slot, id)}
                      className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                        on
                          ? "border-sage bg-butter-soft/60"
                          : "border-line bg-paper hover:border-sage/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                          on ? "border-sage-deep bg-sage-deep text-white" : "border-line text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className="flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-ink">{a.name}</span>
                          <span className="font-display text-pewter">{formatPrice(a.amountCents)}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{a.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-center text-sm text-sage-deep">{error}</p>}

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={order}
            disabled={busy || lines.length === 0}
            className="w-full rounded-full bg-sage-deep py-3.5 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-50 sm:w-auto sm:px-10"
          >
            {lines.length === 0
              ? "Choose a keepsake"
              : busy
                ? "Taking you to checkout…"
                : `Personalize & order · ${formatPrice(total)}`}
          </button>
          <p className="text-xs text-ink-soft">Made to order and shipped. No rush — it&apos;ll keep.</p>
        </div>
      </div>
    </section>
  );
}
