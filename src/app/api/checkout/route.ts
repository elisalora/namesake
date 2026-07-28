import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { originFrom, getCurrentUser } from "@/lib/auth";
import { journeyDraft } from "@/lib/journey";
import { getMemberForWorkspace } from "@/lib/session";
import { createPurchase, createExtension, startCheckout } from "@/lib/purchase";
import { TIERS, isTierId, isAddOnId } from "@/lib/pricing";

const addOns = z
  .array(z.string().refine(isAddOnId, "Unknown add-on."))
  .max(6)
  .optional();

const schema = z.discriminatedUnion("kind", [
  // A journey bought for yourself. The draft rides along and becomes the
  // journey once payment clears.
  z.object({
    kind: z.literal("journey"),
    tier: z.string().refine(isTierId, "Unknown tier."),
    draft: journeyDraft,
    addOns,
  }),
  // One bought for someone else. They describe the journey themselves — and
  // for a boxed tier there may be no email at all, because the code travels
  // on the card inside the box.
  z.object({
    kind: z.literal("gift"),
    tier: z.string().refine(isTierId, "Unknown tier."),
    // These strings are shown to the buyer verbatim (see the `safeParse`
    // failure below), so they have to read as errors. "We'll send your receipt
    // here." was a field hint sitting in the message slot: someone who typed
    // an address the browser accepted but this rejects — a domain with no dot,
    // say — was shown a sentence that never mentioned anything was wrong, on
    // the one screen where giving up costs a sale.
    purchaserEmail: z
      .string()
      .trim()
      .email("That email doesn't look quite right — check for a missing dot or a stray character. Your receipt goes here."),
    purchaserName: z
      .string()
      .trim()
      .min(1, "We'll need your name, so they know who it's from.")
      .max(60, "That name is a little long — 60 characters or fewer."),
    recipientEmail: z
      .string()
      .trim()
      .email("Their email doesn't look quite right — check for a missing dot or a stray character.")
      .optional()
      .or(z.literal("")),
    giftMessage: z
      .string()
      .trim()
      .max(500, "That note is a little longer than the card can hold — 500 characters or fewer.")
      .optional()
      .or(z.literal("")),
    addOns,
  }),
  // More time on a journey you're already part of.
  z.object({ kind: z.literal("extend"), workspaceId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const origin = originFrom(request);

  let purchase;
  if (input.kind === "extend") {
    // Only someone already in the journey may buy time for it — and note this
    // deliberately uses plain membership, not write access: an expired journey
    // is precisely when someone needs to extend.
    const member = await getMemberForWorkspace(input.workspaceId);
    const user = await getCurrentUser();
    if (!member || !user) return NextResponse.json({ error: "Not your journey." }, { status: 403 });

    // A journey with no end date predates billing and never expires. There is
    // no more time to sell them, and applying a month to it would be a downgrade
    // they paid for. The dashboard already hides the button; this closes the
    // route behind it.
    const ws = await db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { expiresAt: true },
    });
    if (ws && ws.expiresAt === null) {
      return NextResponse.json(
        { error: "This journey doesn't expire — there's no more time to add." },
        { status: 400 },
      );
    }

    purchase = await createExtension(input.workspaceId, user.email, member.name);
  } else {
    const tier = TIERS[input.tier as keyof typeof TIERS];

    // A tier is either something you buy for yourself or something you give.
    // Buying the self-serve tier "as a gift" would skip the redemption flow it
    // depends on, so the two can't be crossed.
    if (tier.kind !== input.kind) {
      return NextResponse.json(
        { error: `${tier.name} can't be bought that way.` },
        { status: 400 },
      );
    }

    if (input.kind === "journey") {
      purchase = await createPurchase({
        tier: tier.id,
        purchaserEmail: input.draft.you.email,
        purchaserName: input.draft.you.name,
        draft: input.draft,
        addOns: input.addOns,
      });
    } else {
      // A digital gift has no box to carry the code, so it has to be emailed.
      if (!tier.physical && !input.recipientEmail) {
        return NextResponse.json(
          { error: "Where should we send it? A digital gift needs their email address." },
          { status: 400 },
        );
      }
      purchase = await createPurchase({
        tier: tier.id,
        purchaserEmail: input.purchaserEmail,
        purchaserName: input.purchaserName,
        recipientEmail: input.recipientEmail || undefined,
        giftMessage: input.giftMessage || undefined,
        addOns: input.addOns,
      });
    }
  }

  const checkout = await startCheckout(purchase.id, origin);
  if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: 502 });

  return NextResponse.json({
    purchaseId: purchase.id,
    url: checkout.url,
    simulated: checkout.simulated,
  });
}
