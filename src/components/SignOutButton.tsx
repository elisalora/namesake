"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className={`text-sm text-ink-soft transition hover:text-rose-deep disabled:opacity-60 ${className}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
