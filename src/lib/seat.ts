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
