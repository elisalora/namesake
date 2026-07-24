import Link from "next/link";
import { redirect } from "next/navigation";
import EmailLinkForm from "@/components/EmailLinkForm";
import { getCurrentUser } from "@/lib/auth";

const MESSAGES: Record<string, string> = {
  expired: "That link had expired — they only last 30 minutes. Here's a fresh one.",
  used: "That link had already been used. Links work once; here's another.",
  invalid: "We didn't recognise that link. Try signing in below.",
  malformed: "Something went wrong opening that link. Let's start again.",
  "seat-taken": "That seat has already been claimed by someone else.",
};

export default async function SignInPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;
  const user = await getCurrentUser();
  if (user) redirect("/journeys");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
      <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-plum">
        Namesake
      </Link>

      <div className="animate-rise mt-6 rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(111,77,107,0.4)]">
        <h1 className="font-display text-3xl text-ink">Welcome back</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">
          Enter the email you started your journey with.
        </p>

        {error && MESSAGES[error] && (
          <p className="mb-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
            {MESSAGES[error]}
          </p>
        )}

        <EmailLinkForm cta="Email me a sign-in link" />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Haven&apos;t started yet?{" "}
        <Link href="/" className="font-semibold text-rose-deep hover:text-plum">
          Begin a journey
        </Link>
      </p>
    </main>
  );
}
