import { NextResponse } from "next/server";
import { z } from "zod";
import { originFrom, getCurrentUser } from "@/lib/auth";
import { journeyDraft } from "@/lib/journey";
import { getMemberForWorkspace } from "@/lib/session";
import { createPurchase, startCheckout } from "@/lib/purchase";

// Three things can be bought, and they need different things known up front.
const schema = z.discriminatedUnion("kind", [
  // Buying a journey for yourself: the draft rides along and becomes the
  // journey once payment clears.
  z.object({ kind: z.literal("journey"), draft: journeyDraft }),
  // Buying one for someone else: they'll describe the journey themselves.
  z.object({
    kind: z.literal("gift"),
    recipientEmail: z.string().trim().email("Where should we send it?"),
    purchaserEmail: z.string().trim().email("We'll send your receipt here."),
    purchaserName: z.string().trim().min(1).max(60),
    giftMessage: z.string().trim().max(500).optional().or(z.literal("")),
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
  if (input.kind === "journey") {
    purchase = await createPurchase({
      kind: "journey",
      purchaserEmail: input.draft.you.email,
      purchaserName: input.draft.you.name,
      draft: input.draft,
    });
  } else if (input.kind === "gift") {
    purchase = await createPurchase({
      kind: "gift",
      purchaserEmail: input.purchaserEmail,
      purchaserName: input.purchaserName,
      recipientEmail: input.recipientEmail,
      giftMessage: input.giftMessage || undefined,
    });
  } else {
    // Only someone already in the journey may buy time for it — and note this
    // deliberately uses plain membership, not write access: an expired journey
    // is precisely when someone needs to extend.
    const member = await getMemberForWorkspace(input.workspaceId);
    const user = await getCurrentUser();
    if (!member || !user) return NextResponse.json({ error: "Not your journey." }, { status: 403 });
    purchase = await createPurchase({
      kind: "extend",
      purchaserEmail: user.email,
      purchaserName: member.name,
      workspaceId: input.workspaceId,
    });
  }

  const checkout = await startCheckout(purchase.id, origin);
  if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: 502 });

  return NextResponse.json({
    purchaseId: purchase.id,
    url: checkout.url,
    simulated: checkout.simulated,
  });
}
