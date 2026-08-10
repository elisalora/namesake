"use client";

import { useState } from "react";

/// The longest the server will accept for the story (`reason` in the route's
/// schema). Mirrored here so the field can stop rather than reject.
const REASON_MAX = 600;

/// What a guest is told when the post doesn't land.
///
/// Every one of these used to be "Sorry — that didn't go through. Try again in
/// a moment." Two of them will never work no matter how long you wait, and the
/// person reading them has no account, no history, and no way to ask — so a
/// wrong guess sends them away thinking the couple's link is broken.
function messageFor(code: string | null): string {
  switch (code) {
    case "decided":
      return "They've chosen their name — so the suggestions are closed. Thank you for wanting to help.";
    case "expired":
      return "This journey has closed, so it isn't taking new names. If you know the parents, they can reopen it.";
    case "closed":
      return "This journey isn't taking suggestions at the moment.";
    case "not_found":
      return "This suggestion link doesn't seem to exist any more. Worth checking it with whoever sent it.";
    case "full":
      return "This journey has all the suggestions it can hold — the parents have plenty to be going on with. Tell them your name in person; it'll mean more anyway.";
    case "too_many":
      return "A lot of names are arriving at once. Give it a minute and send yours again — nothing you've written is lost.";
    default:
      return "Sorry — that didn't go through. Try again in a moment.";
  }
}

export default function SuggestForm({ slug, babyLabel }: { slug: string; babyLabel: string }) {
  const [form, setForm] = useState({ suggesterName: "", relationship: "", suggestedName: "", reason: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  /// Set when the failure is permanent. The form stays on screen so nothing
  /// they wrote is lost, but the button stops inviting a retry that can't work.
  const [closed, setClosed] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.suggesterName.trim() || !form.suggestedName.trim()) {
      setError("Please add your name and a name you'd suggest.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(`/api/suggest/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const data = await res.json().catch(() => null);
      const code: string | null = data?.error ?? null;
      // A 400 means we sent something the server won't take. The only field a
      // person can overflow by hand is the story, and telling them "try again"
      // while they retype the same paragraph is the cruellest version of this.
      if (res.status === 400) {
        setError(
          data?.field === "reason"
            ? `That story is a little longer than we can keep — ${REASON_MAX} characters is the limit. Trimming the end usually does it.`
            : "Something in there wasn't quite right. Have a look over the fields and try again.",
        );
      } else {
        setError(messageFor(code));
        if (res.status === 409 || res.status === 404) setClosed(true);
      }
      setState("idle");
    } catch {
      // Genuinely transient — no response at all. This is the one case the old
      // message was written for.
      setError("Sorry — that didn't go through. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="animate-rise rounded-3xl border border-line bg-card p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-butter-soft text-3xl">♥</div>
        <h2 className="font-display text-2xl text-pewter">Thank you!</h2>
        <p className="mt-2 text-ink-soft">
          Your suggestion for <span className="font-semibold">{form.suggestedName}</span> is on its
          way to the parents. It means a lot that you shared it.
        </p>
        <button
          onClick={() => {
            setForm({ suggesterName: form.suggesterName, relationship: form.relationship, suggestedName: "", reason: "" });
            setState("idle");
          }}
          className="mt-6 rounded-full border border-line px-5 py-2.5 text-pewter transition hover:border-sage"
        >
          Suggest another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="animate-rise space-y-4 rounded-3xl border border-line bg-card p-7">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Your name</span>
          <input value={form.suggesterName} onChange={(e) => set("suggesterName", e.target.value)} placeholder="Grandma Rose"
            maxLength={60}
            className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-sage" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">How you&apos;re related <span className="font-normal text-ink-soft">optional</span></span>
          <input value={form.relationship} onChange={(e) => set("relationship", e.target.value)} placeholder="Grandmother"
            maxLength={60}
            className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-sage" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">The name you&apos;d suggest</span>
        <input value={form.suggestedName} onChange={(e) => set("suggestedName", e.target.value)} placeholder="Eleanor"
          maxLength={60}
          className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-lg outline-none focus:border-sage" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Why this name? <span className="font-normal text-ink-soft">the story means the most</span></span>
        <textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={3}
          maxLength={REASON_MAX}
          placeholder="It was my mother's name — she was the kindest, most joyful person…"
          className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-sage" />
        {/* Only once they're near it. A counter under an empty box reads as a
            word limit on a question that just asked for a story. */}
        {form.reason.length > REASON_MAX - 100 && (
          <span className="mt-1 block text-right text-xs text-ink-soft">
            {REASON_MAX - form.reason.length} characters left
          </span>
        )}
      </label>
      {error && <p className="text-sm text-sage-deep">{error}</p>}
      <button disabled={state === "sending" || closed} className="w-full rounded-full bg-sage-deep py-3 font-display text-lg text-white transition hover:bg-pewter disabled:opacity-60">
        {state === "sending" ? "Sending…" : `Send my suggestion for ${babyLabel}`}
      </button>
    </form>
  );
}
