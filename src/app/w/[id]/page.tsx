import Link from "next/link";
import { getWorkspaceState } from "@/lib/workspace";
import { getMemberForWorkspace } from "@/lib/session";
import Dashboard from "@/components/Dashboard";

export default async function WorkspacePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string; welcome?: string }>;
}) {
  const { id } = await props.params;
  const { invite, welcome } = await props.searchParams;

  const member = await getMemberForWorkspace(id);
  if (!member) {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-3xl text-plum">This space is private</div>
        <p className="mt-3 text-ink-soft">
          Only the two parents can open a Namesake journey. Sign in with the email address you
          started with — or, if your partner invited you, open the link they sent.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signin"
            className="rounded-full bg-rose-deep px-6 py-3 font-display text-white transition hover:bg-plum"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="rounded-full border border-line px-6 py-3 font-display text-plum transition hover:border-rose"
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
      inviteToken={invite ?? null}
      showWelcome={welcome === "1"}
    />
  );
}
