import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { issueLoginLink, originFrom } from "@/lib/auth";
import { sendSignInLink, sendInviteLink, emailFallsBackToConsole } from "@/lib/email";

const schema = z.object({
  email: z.string().trim().email("That doesn't look like an email address."),
  // Present when someone is claiming a seat from a shared invite link.
  seatToken: z.string().trim().min(1).optional(),
  /// What they'd like to be called. Only meaningful alongside a seatToken.
  name: z.string().trim().max(60).optional(),
  // Where to land afterwards. Kept to in-app paths — the redeem side validates
  // again, but there's no reason to mint a link carrying anything else.
  returnTo: z
    .string()
    .trim()
    .regex(/^\/(?!\/)/, "Bad destination.")
    .optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const { email, seatToken, returnTo, name } = parsed.data;
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
      console.warn(`[namesake] invite refused: seat ${seat.id} already claimed`);
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
      name,
    });
    if (!link.ok) {
      console.warn(`[namesake] invite refused: rate limit for ${email}`);
      return NextResponse.json({ error: link.error }, { status: 429 });
    }

    const inviter = seat.workspace.members.find((m) => m.isOwner);
    const sent = await sendInviteLink(
      link.email,
      link.url,
      inviter?.name ?? "Your partner",
      seat.workspace.babyLabel,
    );
    if (!deliverable(sent)) return undeliverable();
    // Sign-in has no fallback, so every issued link is worth a log line: when
    // someone says "it never arrived", this is what tells you whether we sent
    // it, refused to, or never got that far.
    console.log(`[namesake] invite link sent to ${link.email} for seat ${seat.id}`);
    return NextResponse.json({ sent: true, email: link.email, devUrl: devUrl(link.url) });
  }

  // Plain sign-in. We send a link whether or not this address has an account —
  // saying "no such user" would leak who's using Namesake.
  const link = await issueLoginLink({ email, purpose: "login", origin, returnTo });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 429 });

  const sent = await sendSignInLink(link.email, link.url);
  if (!deliverable(sent)) return undeliverable();
  console.log(`[namesake] sign-in link sent to ${link.email}`);
  return NextResponse.json({ sent: true, email: link.email, devUrl: devUrl(link.url) });
}

/// In local development with no mail provider we log the link instead, which is
/// a deliberate path rather than a failure. Everywhere else a failed send is a
/// real failure and must not be reported as success — there is no password to
/// fall back on, so a swallowed error means a person simply cannot get in, and
/// nobody finds out. That includes a deployed box with no key at all, which is
/// the same silence wearing a different hat.
function deliverable(result: { delivered: boolean }) {
  return result.delivered || emailFallsBackToConsole();
}

function undeliverable() {
  return NextResponse.json(
    { error: "We couldn't send that email just now. Try again in a moment." },
    { status: 502 },
  );
}

// Only ever populated in local development with no mail provider configured,
// so the sign-in loop stays walkable without a Resend account. The moment a key
// is set this returns nothing and sign-in goes through the inbox like everyone
// else's.
function devUrl(url: string) {
  return emailFallsBackToConsole() ? url : undefined;
}
