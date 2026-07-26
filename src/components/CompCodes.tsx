"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Code = {
  code: string;
  created: string;
  redeemed: boolean;
  babyLabel: string | null;
  fromName: string | null;
  message: string | null;
  recipientEmail: string | null;
};

/// What became of the invitation email, when there was an address to send to.
type Minted = {
  url: string;
  mailed: "sent" | "console" | "failed" | null;
  recipientEmail: string | null;
};

/// `url` may be absolute (as the mint endpoint returns it) or a bare path (as
/// the server-rendered list has it, which can't know the origin). Resolving at
/// click time covers both without the component needing to be told which.
function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-sage-deep transition hover:border-sage"
    >
      {copied ? "Copied!" : label ?? "Copy link"}
    </button>
  );
}

export default function CompCodes({ codes }: { codes: Code[] }) {
  const router = useRouter();
  const [fromName, setFromName] = useState("");
  const [message, setMessage] = useState("");
  const [months, setMonths] = useState(6);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);
    setMinted(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromName: fromName.trim() || undefined,
          message: message.trim() || undefined,
          months,
          recipientEmail: recipientEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setMinted({ url: data.url, mailed: data.mailed ?? null, recipientEmail: data.recipientEmail });
      setRecipientEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="rounded-2xl border border-line bg-card p-6">
        <h2 className="font-display text-xl text-ink">Make a free code</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A link you can hand to a friend or tester. No card, no checkout — they open it, sign in,
          and start. The keepsake add-ons are still theirs to buy at the end.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 flex items-baseline gap-1.5 text-xs font-semibold text-ink-soft">
            Send it to
            <span className="font-normal">
              optional — leave it blank and you&apos;ll get a link to pass on yourself
            </span>
          </span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="friend@example.com"
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sage"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">From (optional)</span>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Elisabeth"
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sage"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">Months of access</span>
            <input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 6)}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sage"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">Note to them (optional)</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="With love — go find their name"
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sage"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-sage-deep">{error}</p>}

        <button
          onClick={mint}
          disabled={busy}
          className="mt-4 rounded-full bg-sage-deep px-6 py-2.5 font-semibold text-white transition hover:bg-pewter disabled:opacity-60"
        >
          {busy ? "Making it…" : recipientEmail.trim() ? "Generate and send it" : "Generate a code"}
        </button>

        {minted && (
          <div className="mt-4 rounded-xl border border-sage/50 bg-butter-soft/50 p-3">
            {minted.mailed && (
              <p className="mb-2 text-sm text-ink">
                {minted.mailed === "sent" && (
                  <>
                    Sent to <strong>{minted.recipientEmail}</strong>. Here&apos;s your own copy of the
                    link:
                  </>
                )}
                {/* No mail provider locally — the email went to the server log
                    instead, so the link below is the only way to hand it over. */}
                {minted.mailed === "console" && (
                  <>
                    The code is ready, but there&apos;s no mail provider configured here, so nothing
                    was actually emailed to {minted.recipientEmail}. Send them this link:
                  </>
                )}
                {minted.mailed === "failed" && (
                  <>
                    The code is ready, but the email to {minted.recipientEmail} didn&apos;t go
                    through. Send them this link instead:
                  </>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 truncate text-sm text-ink">{minted.url}</span>
              <CopyLink url={minted.url} label="Copy the link" />
            </div>
          </div>
        )}
      </div>

      <h2 className="mt-8 font-display text-xl text-ink">Codes you&apos;ve made</h2>
      {codes.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {codes.map((c) => (
            <li
              key={c.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.redeemed ? "bg-sage/20 text-sage-deep" : "bg-butter-soft text-[#8a6d1f]"
                    }`}
                  >
                    {c.redeemed ? "Opened" : "Unused"}
                  </span>
                  {c.redeemed && c.babyLabel && (
                    <span className="text-sm text-ink">Naming {c.babyLabel}</span>
                  )}
                  {c.recipientEmail && (
                    <span className="truncate text-sm text-ink-soft">→ {c.recipientEmail}</span>
                  )}
                  <span className="text-xs text-ink-soft">{c.created.slice(0, 10)}</span>
                </div>
                {c.message && <div className="mt-1 truncate text-xs italic text-ink-soft">“{c.message}”</div>}
              </div>
              {!c.redeemed && <CopyLink url={`/redeem/${c.code}`} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
