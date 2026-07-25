// Naming a seat, shared between server and client.
//
// Deliberately its own module with no imports: the client Dashboard needs
// these, and reaching into lib/journey.ts for them would drag Prisma into the
// browser bundle.

/// What a seat is called before anyone has said who sits in it. The partner's
/// name is optional at signup — plenty of people start this alone, before
/// they've told anyone.
export const DEFAULT_PARTNER_NAME = "Partner";

/// Read an unnamed seat as a phrase rather than a name: "Invite your partner"
/// rather than "Invite Partner".
export function seatLabel(name: string) {
  return name === DEFAULT_PARTNER_NAME ? "your partner" : name;
}

/// The people worth naming out loud — on the suggestion page family will see,
/// or on the keepsake. A seat nobody has named isn't a person yet, and
/// "Mia & Partner" is worse than simply "Mia".
export function namedParents(members: { name: string }[]) {
  return members.map((m) => m.name.trim()).filter((n) => n && n !== DEFAULT_PARTNER_NAME);
}

/// Those names as a phrase: "Mia", "Mia & Sam", "Mia, Sam & Jo".
export function parentLine(members: { name: string }[], fallback = "") {
  const names = namedParents(members);
  if (names.length === 0) return fallback;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
