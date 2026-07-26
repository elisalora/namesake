import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { originFrom } from "@/lib/auth";
import { createCompGift } from "@/lib/purchase";

// Mint a free access code to hand to a friend, tester, or family member.
// Admin-only; there is no charge and no checkout.
const schema = z.object({
  fromName: z.string().trim().max(60).optional(),
  message: z.string().trim().max(300).optional(),
  months: z.number().int().min(1).max(24).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the details." }, { status: 400 });
  }

  const gift = await createCompGift({ createdByEmail: admin.email, ...parsed.data });
  return NextResponse.json({
    code: gift.redeemCode,
    url: `${originFrom(request)}/redeem/${gift.redeemCode}`,
  });
}
