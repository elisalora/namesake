import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { normalizeEmail, originFrom } from "@/lib/auth";
import { createCompGift } from "@/lib/purchase";
import { sendGiftLink, emailFallsBackToConsole } from "@/lib/email";

// Mint a free access code to hand to a friend, tester, or family member.
// Admin-only; there is no charge and no checkout.
const schema = z.object({
  fromName: z.string().trim().max(60).optional(),
  message: z.string().trim().max(300).optional(),
  months: z.number().int().min(1).max(24).optional(),
  // Optional on purpose — a code with nobody attached to it is still useful,
  // and is how you hand one over in a text message or in person.
  recipientEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the details." }, { status: 400 });
  }

  // Normalize once, here, so the address we mail, the one we store, and the one
  // we echo back to the page are all the same string.
  const recipientEmail = parsed.data.recipientEmail
    ? normalizeEmail(parsed.data.recipientEmail)
    : undefined;
  const gift = await createCompGift({ createdByEmail: admin.email, ...parsed.data, recipientEmail });
  const url = `${originFrom(request)}/redeem/${gift.redeemCode}`;

  // The code is already granted, so a failed send is worth saying out loud but
  // not worth losing the link over: it comes back either way, and the list on
  // the page keeps it for copying by hand.
  let mailed: "sent" | "console" | "failed" | null = null;
  if (recipientEmail) {
    const sent = await sendGiftLink(recipientEmail, url, gift.purchaserName ?? "Namesake", gift.giftMessage);
    mailed = sent.delivered ? "sent" : emailFallsBackToConsole() ? "console" : "failed";
    console.log(`[namesake] comp code ${gift.redeemCode} for ${recipientEmail} — ${mailed}`);
  }

  return NextResponse.json({ code: gift.redeemCode, url, mailed, recipientEmail: recipientEmail ?? null });
}
