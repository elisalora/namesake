import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getJourneysForUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import SignOutButton from "@/components/SignOutButton";

// Where you land when you're signed in but we don't know which journey you
// meant — more than one, or (for a brand-new address) none at all.
export default async function JourneysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const journeys = await getJourneysForUser(user.id);
  if (journeys.length === 1) redirect(`/w/${journeys[0].workspaceId}`);

  const admin = await requireAdmin();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-pewter">
          Namesake
        </Link>
        <div className="flex items-center gap-4">
          {admin && (
            <Link href="/admin/codes" className="text-sm font-semibold text-ink-soft hover:text-sage-deep">
              Free codes
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      {journeys.length === 0 ? (
        <div className="animate-rise mt-16 rounded-3xl border border-line bg-card p-8 text-center">
          <div className="text-4xl">🕊️</div>
          <h1 className="mt-3 font-display text-3xl text-ink">Nothing here yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            You&apos;re signed in as <span className="font-semibold text-ink">{user.email}</span>,
            but this address isn&apos;t part of a journey yet. If your partner invited you, open the
            link they sent — otherwise, start your own.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
          >
            Start a journey
          </Link>
        </div>
      ) : (
        <>
          <h1 className="animate-rise mt-10 font-display text-4xl text-ink">Your journeys</h1>
          <ul className="mt-6 grid gap-3">
            {journeys.map((j) => (
              <li key={j.workspaceId}>
                <Link
                  href={`/w/${j.workspaceId}`}
                  className="flex items-center justify-between rounded-2xl border border-line bg-card p-5 transition hover:border-sage hover:shadow-[0_18px_40px_-28px_rgba(65,74,69,0.5)]"
                >
                  <div>
                    <div className="font-display text-xl text-pewter">{j.babyLabel}</div>
                    <div className="mt-0.5 text-sm text-ink-soft">
                      {j.chosenName ? `Named ${j.chosenName}` : "Still choosing"}
                    </div>
                  </div>
                  <span className="text-ink-soft">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
