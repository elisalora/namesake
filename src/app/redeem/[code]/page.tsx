import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import EmailLinkForm from "@/components/EmailLinkForm";
import RedeemPanel from "@/components/RedeemPanel";

// The far end of a purchase. Same page for both shapes: a journey you bought
// for yourself (details already known) and a gift someone bought for you
// (details still to come). Whoever holds this link and signs in owns what it
// grants — which is exactly what makes gifting work.
export default async function RedeemPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;

  const purchase = await db.purchase.findUnique({ where: { redeemCode: code } });
  if (!purchase || purchase.kind === "extend") {
    return (
      <Shell title="We don't recognise this link">
        <p className="text-sm leading-relaxed text-ink-soft">
          Check the link in your email, or start a journey of your own.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-rose-deep px-6 py-3 font-display text-white transition hover:bg-plum"
        >
          Start a journey
        </Link>
      </Shell>
    );
  }

  if (purchase.status === "redeemed") {
    return (
      <Shell title="This one's already open">
        <p className="text-sm leading-relaxed text-ink-soft">
          This journey has already been claimed. Sign in with the email you used and it&apos;ll be
          waiting for you.
        </p>
        <Link
          href="/journeys"
          className="mt-5 inline-block rounded-full bg-rose-deep px-6 py-3 font-display text-white transition hover:bg-plum"
        >
          Go to your journeys
        </Link>
      </Shell>
    );
  }

  const isGift = purchase.kind === "gift";

  // Paid via Stripe but the webhook hasn't landed yet — a second or two, and
  // the client below polls rather than making them refresh by hand.
  const awaitingPayment = purchase.status === "pending";

  const user = await getCurrentUser();
  if (!user) {
    const suggested = (isGift ? purchase.recipientEmail : purchase.purchaserEmail) ?? "";
    return (
      <Shell
        title={
          isGift
            ? `${purchase.purchaserName || "Someone"} gave you a Namesake journey`
            : "Your journey is paid for"
        }
      >
        {isGift && purchase.giftMessage && (
          <blockquote className="mb-4 border-l-2 border-line pl-4 text-sm italic leading-relaxed text-ink-soft">
            {purchase.giftMessage}
          </blockquote>
        )}
        <p className="text-sm leading-relaxed text-ink-soft">
          Pop in your email and we&apos;ll send a link that signs you in and opens it.
        </p>
        <div className="mt-6">
          <EmailLinkForm
            defaultEmail={suggested}
            returnTo={`/redeem/${code}`}
            cta={isGift ? "Open my gift" : "Open my journey"}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={isGift ? "Let's set up your journey" : "Your journey is ready"}>
      <RedeemPanel
        code={code}
        needsDetails={isGift}
        awaitingPayment={awaitingPayment}
        signedInAs={user.email}
        windowLabel={windowLabel(purchase)}
        // A due-date-relative tier can't know when it ends until they tell us.
        dueDateMatters={purchase.expiryRule === "due_date_grace"}
        giftFrom={isGift ? purchase.purchaserName : null}
        giftMessage={isGift ? purchase.giftMessage : null}
      />
    </Shell>
  );
}

/// How long this grant runs, in words. A due-date tier can't say yet.
function windowLabel(purchase: {
  expiryRule: string;
  months: number | null;
  graceDays: number | null;
}) {
  if (purchase.expiryRule === "due_date_grace") {
    return `until your due date, plus ${purchase.graceDays ?? 7} days`;
  }
  const months = purchase.months ?? 1;
  return months === 1 ? "a month" : `${months} months`;
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
