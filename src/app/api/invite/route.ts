import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemberForWorkspace } from "@/lib/session";
import { originFrom } from "@/lib/auth";
import { sendPartnerInvite } from "@/lib/invite";

const schema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().email().optional().or(z.literal("")),
});

// Send (or re-send) the invitation to the empty seat in a journey.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const member = await getMemberForWorkspace(parsed.data.workspaceId);
  if (!member) return NextResponse.json({ error: "Not your journey." }, { status: 403 });

  const result = await sendPartnerInvite({
    workspaceId: parsed.data.workspaceId,
    origin: originFrom(request),
    fromName: member.name,
    email: parsed.data.email || undefined,
  });
  // 502 for a send that never reached a provider: nothing the parent typed is
  // wrong, and telling them "sent" when it wasn't leaves their partner locked
  // out of a journey they were told is waiting for them.
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.reason === "undeliverable" ? 502 : 400 },
    );
  }

  return NextResponse.json({ sent: true, email: result.email, devUrl: result.devUrl });
}
