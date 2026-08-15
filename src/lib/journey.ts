import { z } from "zod";
import { nanoid, customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_PARTNER_NAME } from "@/lib/seat";
import { MAX_BABIES } from "@/lib/babies";
import { DUE_DATE_MESSAGE, isDueDateOrBlank, parseDueDate } from "@/lib/dates";

const slugId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/// Reserve the public suggestion slug before there's a journey to attach it
/// to, so a card carrying it can be printed and boxed at purchase time.
export function reserveSuggestSlug() {
  return slugId();
}

// Avatar tints — sage and antique brass, so the two of you are told apart at a
// glance without either colour fighting the rest of the page.
const PALETTE = ["#7d8f76", "#a98a4f"];

// What the start form collects. The draft rides inside the signup magic link,
// so the journey isn't created until the owner has proven their address.
///
/// Every message here is shown to a customer verbatim: `/api/checkout` hands
/// `issues[0].message` straight back, and StartForm renders it in its error
/// slot. Left unset, Zod supplies its own — "Too big: expected string to have
/// <=60 characters" — which is a sentence written for a developer reading a
/// stack trace, arriving instead in front of someone trying to pay.
export const journeyDraft = z.object({
  babyLabel: z.string().trim().max(60, "That nickname is a little long — 60 characters or fewer.").optional(),
  lastName: z.string().trim().max(60, "That surname is a little long — 60 characters or fewer.").optional(),
  /// Twins and triplets. Asked at the start because it changes the whole
  /// journey — two names, weighed against each other — and finding out
  /// halfway through is worse than one more question here.
  babyCount: z.number().int().min(1).max(MAX_BABIES).optional(),
  /// "surprise" is a real answer — it means they know they don't want to know,
  /// which is different from never having been asked. "mixed" is one of each,
  /// which only exists once there's more than one baby.
  expecting: z.enum(["girl", "boy", "mixed", "surprise"]).optional(),
  /// The only field in this draft a *gift recipient* fills in, and the only
  /// one that decides anything but text: for the `due_date_grace` tiers it is
  /// what `resolveExpiry` turns into the end of the paid window. Unchecked, it
  /// did two things — `"2999-01-01"` bought a nine-century window on a $50
  /// gift, and `"banana"` reached `new Date()` below and made opening a
  /// present a 500. One rule, in lib/dates.ts, shared with the PATCH route
  /// that edits the same field later.
  dueDate: z
    .string()
    .refine((v) => isDueDateOrBlank(v), DUE_DATE_MESSAGE)
    .optional(),
  /// A name they already had in mind, put on the shortlist the moment the
  /// journey opens.
  ///
  /// Only ever set by the handoff from `/check`: somebody typed a whole name
  /// into the free checker, read the answer, and pressed the button. Arriving
  /// at an empty shortlist forty seconds later would throw away the one thing
  /// we know about them, so the journey opens with it already there.
  ///
  /// Optional, and it has to stay optional: this draft is JSON on a Purchase
  /// row and is re-parsed at redemption, which for a gift can be months after
  /// it was written. Every draft stored before this field existed must still
  /// parse, and every gift bought without one simply has no seed.
  ///
  /// No customer-facing messages on these two, unlike every other field here,
  /// because no customer types them: the value is cleaned by `cleanNamePart`
  /// before it reaches the form. The caps are a backstop for a hand-crafted
  /// URL, and a hand-crafted URL must never be able to refuse somebody a
  /// signup — which is why the whole object is dropped rather than rejected if
  /// it doesn't fit.
  seedName: z
    .object({
      firstName: z.string().trim().min(1).max(60),
      middleName: z.string().trim().max(60).optional().or(z.literal("")),
    })
    .optional()
    .catch(undefined),
  you: z.object({
    name: z.string().trim().min(1, "We'll need your first name.").max(60, "That first name is a little long — 60 characters or fewer."),
    // The browser's type=email widget accepts a domain with no dot, so
    // "alex@examplecom" reaches this line looking fine to whoever typed it.
    email: z.string().trim().email("That email doesn't look quite right — check for a missing dot or a stray character."),
  }),
  // The partner's name is optional: plenty of people start this on their own,
  // before they've told anyone, and being made to type someone else's name is
  // a strange first hurdle. The seat is still created — it just waits to be
  // named until they claim it.
  partner: z.object({
    name: z.string().trim().max(60, "That first name is a little long — 60 characters or fewer.").optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("Your partner's email doesn't look quite right — check for a missing dot or a stray character.")
      .optional()
      .or(z.literal("")),
  }),
});

export type JourneyDraft = z.infer<typeof journeyDraft>;

/// Create the workspace and both parent seats. The owner's seat is claimed
/// immediately by `ownerUserId`; the partner's waits for them to verify.
///
/// `expiresAt` is the end of the paid window, and `client` lets redemption run
/// this inside the same transaction that spends the purchase — so a journey and
/// the grant it came from can never disagree about whether it was claimed.
export async function createJourney(
  draft: JourneyDraft,
  ownerUserId: string,
  opts: {
    expiresAt?: Date | null;
    client?: Prisma.TransactionClient;
    /// Reserved on the purchase so the shower card could be printed before
    /// this journey existed. Use it, or the card in the box points nowhere.
    suggestSlug?: string | null;
    /// Nobody has paid for this one. See lib/trial.ts for what that costs
    /// them, which is less than it sounds.
    isTrial?: boolean;
  } = {},
) {
  const client = opts.client ?? db;
  const workspace = await client.workspace.create({
    data: {
      babyLabel: draft.babyLabel?.trim() || "Baby",
      lastName: draft.lastName?.trim() || null,
      babyCount: draft.babyCount ?? 1,
      // "One of each" is only meaningful with more than one baby; if the count
      // came back to one, the answer it belonged to is gone with it.
      expecting: draft.expecting === "mixed" && (draft.babyCount ?? 1) < 2 ? null : draft.expecting ?? null,
      // Never a bare `new Date(...)`. The schema above already refuses
      // anything this would choke on, but the value also reaches here from
      // `redeemPurchase`, which re-parses a draft stored months earlier — so
      // the guard lives at the write rather than only at the door.
      dueDate: parseDueDate(draft.dueDate),
      expiresAt: opts.expiresAt ?? null,
      isTrial: opts.isTrial ?? false,
      suggestSlug: opts.suggestSlug || slugId(),
      members: {
        create: [
          {
            name: draft.you.name,
            email: draft.you.email,
            userId: ownerUserId,
            color: PALETTE[0],
            token: nanoid(24),
            isOwner: true,
          },
          {
            name: draft.partner.name?.trim() || DEFAULT_PARTNER_NAME,
            email: draft.partner.email || null,
            color: PALETTE[1],
            token: nanoid(24),
          },
        ],
      },
    },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  // The name they arrived with, if they arrived with one.
  //
  // On `client` rather than `db` on purpose: redemption runs this inside the
  // transaction that spends the grant, and a journey that exists without the
  // name it was started for is the one state this shouldn't be able to reach.
  if (draft.seedName?.firstName) {
    await client.nameEntry.create({
      data: {
        workspaceId: workspace.id,
        role: "first",
        firstName: draft.seedName.firstName,
        middleName: draft.seedName.middleName?.trim() || null,
        // Left null so it inherits the workspace surname. `lastName` on a name
        // entry means "this one name is spelled against a different surname",
        // which is not what happened here — they typed one family name into
        // the checker and it is already on the workspace.
        lastName: null,
        // Not "considering". Somebody who typed a whole name into a checker
        // and then pressed a button has shortlisted it, and the copy on the
        // handoff says so.
        status: "shortlist",
        source: "parent",
      },
    });
  }

  return {
    workspace,
    owner: workspace.members.find((m) => m.isOwner)!,
    partner: workspace.members.find((m) => !m.isOwner)!,
  };
}
