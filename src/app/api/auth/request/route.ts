import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { issueLoginLink, originFrom } from "@/lib/auth";
import { sendSignInLink, sendInviteLink, emailIsLive } from "@/lib/email";

const schema = z.object({
  email: z.string().trim().email("That doesn't look like an email address."),
  // Present when someone is claiming a seat from a shared invite link.
  seatToken: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const { email, seatToken } = parsed.data;
  const origin = originFrom(request);

  if (seatToken) {
    const seat = await db.member.findUnique({
      where: { token: seatToken },
      include: { workspace: { include: { members: true } } },
    });
    if (!seat) {
      return NextResponse.json({ error: "That invite link isn't valid." }, { status: 404 });
    }
    if (seat.userId) {
      return NextResponse.json(
        { error: "This seat has already been claimed. Sign in with the email you used." },
        { status: 409 },
      );
    }

    const link = await issueLoginLink({
      email,
      purpose: "invite",
      memberId: seat.id,
      origin,
    });
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: 429 });

    const inviter = seat.workspace.members.find((m) => m.isOwner);
    await sendInviteLink(link.email, link.url, inviter?.name ?? "Your partner", seat.workspace.babyLabel);
    return NextResponse.json({ sent: true, email: link.email, devUrl: devUrl(link.url) });
  }

  // Plain sign-in. We send a link whether or not this address has an account —
  // saying "no such user" would leak who's using Namesake.
  const link = await issueLoginLink({ email, purpose: "login", origin });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 429 });

  await sendSignInLink(link.email, link.url);
  return NextResponse.json({ sent: true, email: link.email, devUrl: devUrl(link.url) });
}

// Only ever populated in local development with no mail provider configured,
// so the sign-in loop stays walkable without a Resend account.
function devUrl(url: string) {
  return !emailIsLive() && process.env.NODE_ENV !== "production" ? url : undefined;
}
