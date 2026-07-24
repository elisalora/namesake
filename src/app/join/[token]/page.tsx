import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import EmailLinkForm from "@/components/EmailLinkForm";

// The shareable seat-claim link. It used to hand out access on the spot; now
// it's an introduction, and the seat only opens once the person on the other
// end proves the email address is theirs.
export default async function JoinPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const seat = await db.member.findUnique({
    where: { token },
    include: { workspace: { include: { members: { orderBy: { createdAt: "asc" } } } } },
  });

  if (!seat) {
    return (
      <Shell title="This link has expired">
        <p className="text-sm leading-relaxed text-ink-soft">
          We couldn&apos;t find an invitation here. Ask your partner to send you a fresh one from
          their dashboard.
        </p>
      </Shell>
    );
  }

  // Already claimed? If it's the person looking, just let them in.
  if (seat.userId) {
    const user = await getCurrentUser();
    if (user?.id === seat.userId) redirect(`/w/${seat.workspaceId}`);
    return (
      <Shell title="This seat is taken">
        <p className="text-sm leading-relaxed text-ink-soft">
          Someone has already joined with this link. If that was you, sign in with the email address
          you used.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-block rounded-full bg-rose-deep px-6 py-3 font-display text-white transition hover:bg-plum"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  const inviter = seat.workspace.members.find((m) => m.isOwner);

  return (
    <Shell title={`${inviter?.name ?? "Your partner"} saved you a seat`}>
      <p className="text-sm leading-relaxed text-ink-soft">
        You&apos;re invited into the naming journey for{" "}
        <span className="font-semibold text-ink">{seat.workspace.babyLabel}</span>. Pop in your email
        and we&apos;ll send a link that takes you straight there.
      </p>
      <div className="mt-6">
        <EmailLinkForm
          seatToken={token}
          defaultEmail={seat.email ?? ""}
          cta="Join the journey"
        />
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
      <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-plum">
        Namesake
      </Link>
      <div className="animate-rise mt-6 rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
        <h1 className="mb-3 font-display text-3xl leading-tight text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
