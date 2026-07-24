import { getCurrentUser } from "@/lib/auth";

// Who can see the orders that need packing.
//
// Deliberately just an allowlist of addresses in the environment: there's no
// staff model yet, and inventing one to gate a single page would be more
// machinery than the problem deserves. An empty list means nobody — a missing
// env var shouldn't quietly open the door.

export function adminEmails() {
  return (process.env.NAMESAKE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin() {
  const allowed = adminEmails();
  if (allowed.length === 0) return null;

  const user = await getCurrentUser();
  if (!user || !allowed.includes(user.email.toLowerCase())) return null;
  return user;
}
