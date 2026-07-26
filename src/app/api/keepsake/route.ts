import { NextResponse } from "next/server";
import { z } from "zod";
import { originFrom, getCurrentUser } from "@/lib/auth";
import { getMemberForWorkspace } from "@/lib/session";
import { createKeepsakeOrder, startCheckout } from "@/lib/purchase";
import { isAddOnId, type AddOnId } from "@/lib/pricing";
import { getWorkspaceState } from "@/lib/workspace";

// Ordering a personalized keepsake after the name is chosen. Each line is an
// add-on for one baby's slot; with twins that's naturally two lines. The name
// itself is resolved server-side from the chosen names, so the client can only
// personalize with a name that was actually decided.
const schema = z.object({
  workspaceId: z.string().min(1),
  lines: z
    .array(
      z.object({
        addOn: z.string().refine(isAddOnId, "We don't offer that keepsake."),
        slot: z.number().int().min(0).max(5).nullable().optional(),
      }),
    )
    .min(1, "Pick at least one keepsake.")
    .max(12),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your selection." },
      { status: 400 },
    );
  }
  const { workspaceId, lines } = parsed.data;

  // Plain membership, like extend — buying for a journey you belong to, even
  // once its naming window has closed.
  const member = await getMemberForWorkspace(workspaceId);
  const user = await getCurrentUser();
  if (!member || !user) return NextResponse.json({ error: "Not your journey." }, { status: 403 });

  const ws = await getWorkspaceState(workspaceId);
  if (!ws) return NextResponse.json({ error: "That journey no longer exists." }, { status: 404 });
  if (ws.status !== "decided" || ws.chosen.length === 0) {
    return NextResponse.json(
      { error: "Choose a name first — keepsakes are made once it's decided." },
      { status: 409 },
    );
  }

  const bySlot = new Map(ws.chosen.map((c) => [c.slot, c]));
  const orderLines = lines.map((l) => ({
    addOn: l.addOn as AddOnId,
    personalization: l.slot != null ? bySlot.get(l.slot)?.fullName ?? null : null,
  }));

  const purchase = await createKeepsakeOrder({
    workspaceId,
    purchaserEmail: user.email,
    purchaserName: member.name,
    lines: orderLines,
  });
  if (!purchase) return NextResponse.json({ error: "Nothing to order." }, { status: 400 });

  const checkout = await startCheckout(purchase.id, originFrom(request));
  if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: 502 });

  return NextResponse.json({ url: checkout.url, simulated: checkout.simulated });
}
