import { NextResponse } from "next/server";
import { issueLoginLink, originFrom } from "@/lib/auth";
import { journeyDraft } from "@/lib/journey";
import { sendSignupLink, emailIsLive } from "@/lib/email";

// Starting a journey no longer creates anything on its own — the draft rides
// inside a magic link, and the workspace is born the moment the owner proves
// the email address is theirs. No orphaned journeys from stray form posts.
export async function POST(request: Request) {
  const parsed = journeyDraft.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please add both of your names and your email address." },
      { status: 400 },
    );
  }
  const draft = parsed.data;

  const link = await issueLoginLink({
    email: draft.you.email,
    purpose: "signup",
    payload: draft,
    origin: originFrom(request),
  });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 429 });

  await sendSignupLink(link.email, link.url, draft.babyLabel?.trim() || "your baby");

  return NextResponse.json({
    sent: true,
    email: link.email,
    devUrl:
      !emailIsLive() && process.env.NODE_ENV !== "production" ? link.url : undefined,
  });
}
