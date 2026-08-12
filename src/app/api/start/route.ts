import { NextResponse } from "next/server";
import { z } from "zod";
import { journeyDraft } from "@/lib/journey";
import { createTrialGrant } from "@/lib/purchase";
import { trackFunnel } from "@/lib/analytics";
import { FUNNEL } from "@/lib/funnel";

// Starting a journey without paying for one.
//
// A sibling of `/api/checkout` rather than a branch inside it: that route's
// whole job is to hand somebody a place to pay, and every line of it — the
// tier/kind cross-check, the shipping countries, the Stripe session — is about
// money. A free start has none of that, and the honest version of "the same
// route but skip the payment part" is a second route with no payment part.
//
// What it does *not* do is create anything anyone can use. It mints a grant
// and hands back the link that opens it, which is the identical shape the paid
// path has always had. That is deliberate and it is the whole reason the
// free-turn count means anything: the workspace is born on the far side of a
// magic link, so its owner has a verified address to hang a count on. Move the
// journey to this side of that link and a fresh address is a fresh allowance,
// and the counter in the corner of the chat becomes decoration.
//
// Note there is no check here for whether this person has turns left. There
// can't be — nobody is signed in yet — and there shouldn't be: somebody who
// spent their ten is allowed to start a journey and see what it costs. They
// meet a wall with a price on it rather than a door that won't open, and
// `ChatPanel` has a string written for exactly that arrival.
const schema = z.object({ draft: journeyDraft });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Same contract as `/api/checkout`: every message in `journeyDraft` is
    // written to be read by a customer, and the form renders this verbatim.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." },
      { status: 400 },
    );
  }

  const purchase = await createTrialGrant({ draft: parsed.data.draft });

  // Deliberately the same event the paid path emits, with `amountCents: 0`.
  // A separate event name would split the funnel in two and make the one
  // question worth asking — of everyone who filled the form in, how many got
  // as far as a journey — into an addition somebody has to remember to do.
  await trackFunnel(
    FUNNEL.checkoutCreated,
    { tier: purchase.tier, kind: purchase.kind, amountCents: 0, simulated: false },
    request.headers,
  );

  return NextResponse.json({ url: `/redeem/${purchase.redeemCode}` });
}
