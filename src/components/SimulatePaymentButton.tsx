"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SimulatePaymentButton({
  purchaseId,
  successHref,
}: {
  purchaseId: string;
  successHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not simulate the payment.");
      // `successHref` is the same destination `data.redeemUrl` points at, minus
      // the absolute origin and plus the query Stripe would have carried back.
      router.push(successHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={pay}
        disabled={busy}
        className="w-full rounded-full bg-sage-deep py-3.5 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-60"
      >
        {busy ? "Processing…" : "Simulate a successful payment"}
      </button>
      {error && <p className="mt-2 text-sm text-sage-deep">{error}</p>}
    </>
  );
}
