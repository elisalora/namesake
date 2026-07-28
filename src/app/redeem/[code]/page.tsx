import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { boughtForSomeoneElse } from "@/lib/purchase";
import { supportAddress } from "@/lib/email";
import EmailLinkForm from "@/components/EmailLinkForm";
import RedeemPanel from "@/components/RedeemPanel";

// The far end of a purchase. Same page for both shapes: a journey you bought
// for yourself (details already known) and a gift someone bought for you
// (details still to come). Whoever holds this link and signs in owns what it
// grants — which is exactly what makes gifting work.
export default async function RedeemPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code } = await props.params;
  // Set by Stripe's success_url, so it's only ever the buyer's browser.
  const cameFromCheckout = "bought" in (await props.searchParams);

  const purchase = await db.purchase.findUnique({ where: { redeemCode: code } });
  if (!purchase || purchase.kind === "extend") {
    return (
      <Shell title="We don't recognise this link">
        <p className="text-sm leading-relaxed text-ink-soft">
          Check the link in your email, or start a journey of your own.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
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
          className="mt-5 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
        >
          Go to your journeys
        </Link>
      </Shell>
    );
  }

  // Refunded before anyone opened it, or the charge is being disputed. The form
  // below would fail on submit anyway — `redeemPurchase` refuses both — but it
  // would fail after they had typed out a due date and a baby's nickname, which
  // is a cruel place to be told. A journey already opened never reaches here:
  // its status is `redeemed` and it was answered above.
  if (purchase.status === "refunded" || purchase.status === "disputed") {
    return (
      <Shell title="This link has been closed">
        <p className="text-sm leading-relaxed text-ink-soft">
          The payment behind this journey was reversed, so there&apos;s nothing here to open. If
          that&apos;s a surprise — if someone gave this to you and you didn&apos;t know — write to{" "}
          <a href={`mailto:${supportAddress()}`} className="underline">
            {supportAddress()}
          </a>{" "}
          and we&apos;ll sort it out.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
        >
          Start a journey
        </Link>
      </Shell>
    );
  }

  const isGift = purchase.kind === "gift";

  // Paid via Stripe but the webhook hasn't landed yet — a second or two, and
  // the client below polls rather than making them refresh by hand.
  const awaitingPayment = purchase.status === "pending";

  const user = await getCurrentUser();

  // Checkout lands the buyer on this page, because for a boxed gift with nobody
  // to email they're the one holding the code until the box changes hands. When
  // the gift is going to a named address, that recipient has already been sent
  // this link and the buyer needs a receipt, not a claim form — the form below
  // would open, under the buyer's own account, the present they just paid for,
  // and there is no way to un-redeem it.
  //
  // Two ways in. Signed in as the purchaser is certain — that person cannot
  // redeem this anyway, `redeemPurchase` refuses it. Arriving with `?bought=1`
  // is only a strong guess: it is set by Stripe, but a buyer can copy the URL
  // out of their address bar and forward it, which is one of the ways a gift
  // actually reaches someone. So the guessed case keeps a way through, and the
  // server-side check stays the thing that protects the grant.
  const giftToSomeoneElse = isGift && Boolean(purchase.recipientEmail);
  const knownPurchaser = giftToSomeoneElse && user && boughtForSomeoneElse(purchase, user.email);
  const presumedPurchaser = giftToSomeoneElse && cameFromCheckout && !knownPurchaser;

  if (knownPurchaser || presumedPurchaser) {
    return (
      <Shell title="Your gift is on its way">
        <p className="text-sm leading-relaxed text-ink-soft">
          We&apos;re sending {purchase.recipientEmail} the link that opens it
          {purchase.needsShipping ? ", and the box is being packed" : ""}. It&apos;s theirs to open —
          they&apos;ll describe the journey themselves when they do.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Nothing else to do. Your receipt is in your email.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-sage-deep px-6 py-3 font-display text-white transition hover:bg-pewter"
        >
          Back to Namesake
        </Link>
        {presumedPurchaser && (
          <p className="mt-5 text-xs leading-relaxed text-ink-soft">
            Were you given this link?{" "}
            <Link href={`/redeem/${code}`} className="underline">
              Open your gift
            </Link>
            .
          </p>
        )}
      </Shell>
    );
  }

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
      <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-pewter">
        Namesake
      </Link>
      <div className="animate-rise mt-6 rounded-3xl border border-line bg-card p-7 shadow-[0_20px_60px_-30px_rgba(65,74,69,0.4)]">
        <h1 className="mb-3 font-display text-3xl leading-tight text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
