"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkFulfilled({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mark() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not update.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-sm text-sage-deep">{error}</span>}
      <button
        onClick={mark}
        disabled={busy}
        className="rounded-full bg-sage-deep px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
      >
        {busy ? "…" : "Mark shipped"}
      </button>
    </span>
  );
}
