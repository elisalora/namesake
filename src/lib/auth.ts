import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createJourney, journeyDraft, type JourneyDraft } from "@/lib/journey";

const SESSION_COOKIE = "ns_session";
const LEGACY_COOKIE = "ns_member"; // pre-auth per-member token; cleared on sign-in

const SESSION_DAYS = 60;
const LINK_MINUTES = 30;

// A person may ask for at most this many links in the window below. Keeps a
// stranger from using us to mailbomb an address.
const LINK_LIMIT = 5;
const LINK_WINDOW_MINUTES = 15;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/// Where links in emails should point. Derived from the request in dev; set
/// NAMESAKE_URL in production, where the app sits behind a proxy.
export function originFrom(request: Request) {
  const configured = process.env.NAMESAKE_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

// 256 bits of randomness in the link/cookie; only the hash is ever stored, so
// a database leak yields nothing replayable.
function mintToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ session */

export async function createSession(userId: string) {
  const { raw, hash } = mintToken();
  const expiresAt = daysFromNow(SESSION_DAYS);

  await db.session.create({ data: { userId, tokenHash: hash, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  jar.delete(LEGACY_COOKIE);
}

/// The signed-in person, or null. Safe to call during render — it only reads
/// the cookie and may extend the row's expiry, never sets one.
export async function getCurrentUser() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Rolling window: once a session is past its halfway point, push it out
  // again so active parents are never logged out mid-journey.
  const halfway = daysFromNow(SESSION_DAYS / 2);
  if (session.expiresAt < halfway) {
    await db.session
      .update({ where: { id: session.id }, data: { expiresAt: daysFromNow(SESSION_DAYS) } })
      .catch(() => {});
  }

  return session.user;
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(raw) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(LEGACY_COOKIE);
}

/* -------------------------------------------------------------- magic links */

type Purpose = "signup" | "login" | "invite";

type IssueArgs = {
  email: string;
  purpose: Purpose;
  origin: string;
  payload?: JourneyDraft;
  memberId?: string;
};

/// Mint a single-use link. Returns the URL so the caller can mail it — and, in
/// dev with no mail provider configured, surface it in the UI.
export async function issueLoginLink({ email, purpose, origin, payload, memberId }: IssueArgs) {
  const to = normalizeEmail(email);

  const recent = await db.loginToken.count({
    where: { email: to, createdAt: { gt: new Date(Date.now() - LINK_WINDOW_MINUTES * 60_000) } },
  });
  if (recent >= LINK_LIMIT) {
    return { ok: false as const, error: "That's a lot of links. Give it a few minutes and try again." };
  }

  const { raw, hash } = mintToken();
  await db.loginToken.create({
    data: {
      tokenHash: hash,
      email: to,
      purpose,
      payload: payload ? JSON.stringify(payload) : null,
      memberId: memberId ?? null,
      expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
    },
  });

  return { ok: true as const, email: to, url: `${origin}/auth/verify/${raw}` };
}

export type RedeemResult =
  | { ok: true; workspaceId: string | null; inviteToken?: string; welcome?: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" | "seat-taken" | "malformed" };

/// Consume a magic link: verify it, mark it spent, resolve the person, do
/// whatever the link promised, and sign them in.
export async function redeemLoginLink(raw: string): Promise<RedeemResult> {
  const token = await db.loginToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token) return { ok: false, reason: "invalid" };
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Spend it atomically — two clicks on the same link must not both win.
  const spent = await db.loginToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (spent.count === 0) return { ok: false, reason: "used" };

  const user = await upsertUser(token.email);

  switch (token.purpose) {
    case "signup": {
      const draft = journeyDraft.safeParse(JSON.parse(token.payload ?? "null"));
      if (!draft.success) return { ok: false, reason: "malformed" };

      const { workspace, partner } = await createJourney(draft.data, user.id);
      if (!user.name) {
        await db.user.update({ where: { id: user.id }, data: { name: draft.data.you.name } });
      }
      await createSession(user.id);
      return { ok: true, workspaceId: workspace.id, inviteToken: partner.token, welcome: true };
    }

    case "invite": {
      const member = token.memberId
        ? await db.member.findUnique({ where: { id: token.memberId } })
        : null;
      if (!member) return { ok: false, reason: "invalid" };

      // Already theirs (a re-clicked link) is fine; someone else's is not.
      if (member.userId && member.userId !== user.id) return { ok: false, reason: "seat-taken" };

      // Guard the [workspaceId, userId] pair: if they already hold the other
      // seat in this journey, just send them in rather than colliding.
      const existing = await db.member.findFirst({
        where: { workspaceId: member.workspaceId, userId: user.id },
      });
      if (existing && existing.id !== member.id) {
        await createSession(user.id);
        return { ok: true, workspaceId: member.workspaceId };
      }

      await db.member.update({
        where: { id: member.id },
        data: { userId: user.id, email: token.email },
      });
      if (!user.name) {
        await db.user.update({ where: { id: user.id }, data: { name: member.name } });
      }
      await createSession(user.id);
      return { ok: true, workspaceId: member.workspaceId, welcome: true };
    }

    default: {
      await createSession(user.id);
      const seats = await db.member.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      return { ok: true, workspaceId: seats.length === 1 ? seats[0].workspaceId : null };
    }
  }
}

async function upsertUser(email: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  return db.user.create({ data: { email } });
}

/* -------------------------------------------------------------- memberships */

/// Every journey this person has a claimed seat in.
export async function getJourneysForUser(userId: string) {
  const seats = await db.member.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { workspace: { include: { chosenName: true } } },
  });

  return seats.map((seat) => ({
    workspaceId: seat.workspaceId,
    babyLabel: seat.workspace.babyLabel,
    status: seat.workspace.status,
    chosenName: seat.workspace.chosenName?.firstName ?? null,
    createdAt: seat.workspace.createdAt.toISOString(),
  }));
}
