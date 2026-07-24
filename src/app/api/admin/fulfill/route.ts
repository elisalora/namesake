import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = z
    .object({ purchaseId: z.string().min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Which order?" }, { status: 400 });

  await db.purchase.update({
    where: { id: parsed.data.purchaseId },
    data: { fulfilledAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
