"use client";

import { useState } from "react";

export default function SuggestForm({ slug, babyLabel }: { slug: string; babyLabel: string }) {
  const [form, setForm] = useState({ suggesterName: "", relationship: "", suggestedName: "", reason: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

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
    const res = await fetch(`/api/suggest/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) setState("done");
    else {
      setError("Sorry — that didn't go through. Try again in a moment.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="animate-rise rounded-3xl border border-line bg-card p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-blush text-3xl">♥</div>
        <h2 className="font-display text-2xl text-plum">Thank you!</h2>
        <p className="mt-2 text-ink-soft">
          Your suggestion for <span className="font-semibold">{form.suggestedName}</span> is on its
          way to the parents. It means a lot that you shared it.
        </p>
        <button
          onClick={() => {
            setForm({ suggesterName: form.suggesterName, relationship: form.relationship, suggestedName: "", reason: "" });
            setState("idle");
          }}
          className="mt-6 rounded-full border border-line px-5 py-2.5 text-plum transition hover:border-rose"
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
            className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-rose" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">How you&apos;re related <span className="font-normal text-ink-soft">optional</span></span>
          <input value={form.relationship} onChange={(e) => set("relationship", e.target.value)} placeholder="Grandmother"
            className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-rose" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">The name you&apos;d suggest</span>
        <input value={form.suggestedName} onChange={(e) => set("suggestedName", e.target.value)} placeholder="Eleanor"
          className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-lg outline-none focus:border-rose" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Why this name? <span className="font-normal text-ink-soft">the story means the most</span></span>
        <textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={3}
          placeholder="It was my mother's name — she was the kindest, most joyful person…"
          className="w-full resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-rose" />
      </label>
      {error && <p className="text-sm text-rose-deep">{error}</p>}
      <button disabled={state === "sending"} className="w-full rounded-full bg-rose-deep py-3 font-display text-lg text-white transition hover:bg-plum disabled:opacity-60">
        {state === "sending" ? "Sending…" : `Send my suggestion for ${babyLabel}`}
      </button>
    </form>
  );
}
