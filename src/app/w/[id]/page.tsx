import Link from "next/link";
import { headers } from "next/headers";
import { getWorkspaceState } from "@/lib/workspace";
import { getMemberForWorkspace } from "@/lib/session";
import Dashboard from "@/components/Dashboard";
import { TIERS, formatPrice } from "@/lib/pricing";

/// Where this app is being served from, for the share links.
async function currentOrigin() {
  const configured = process.env.NAMESAKE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host") ?? "localhost:3000"}`;
}

export default async function WorkspacePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { id } = await props.params;
  const { welcome } = await props.searchParams;

  const member = await getMemberForWorkspace(id);
  if (!member) {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-3xl text-pewter">This space is private</div>
        <p className="mt-3 text-ink-soft">
          Only the two parents can open a Namesake journey. Sign in with the email address you
          started with — or, if your partner invited you, open the link they sent.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signin"
            className="rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="rounded-full border border-line px-6 py-3 font-display text-pewter transition hover:border-sage"
          >
            Start a new journey
          </Link>
        </div>
      </main>
    );
  }

  const state = await getWorkspaceState(id);
  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center text-ink-soft">Not found.</main>
    );
  }

  return (
    <Dashboard
      initial={state}
      me={{ id: member.id, name: member.name, color: member.color }}
      origin={await currentOrigin()}
      showWelcome={welcome === "1"}
      // Resolved here, on the server, where the env override is actually
      // readable. See the prop's own note in Dashboard.
      upgradePrice={formatPrice(TIERS.self_serve.amountCents, TIERS.self_serve.currency)}
    />
  );
}
