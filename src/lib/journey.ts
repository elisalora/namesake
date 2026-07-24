import { z } from "zod";
import { nanoid, customAlphabet } from "nanoid";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const slugId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

const PALETTE = ["#c98ba5", "#7ba7bc"];

// What the start form collects. The draft rides inside the signup magic link,
// so the journey isn't created until the owner has proven their address.
export const journeyDraft = z.object({
  babyLabel: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  dueDate: z.string().optional(),
  you: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.string().trim().email(),
  }),
  partner: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.string().trim().email().optional().or(z.literal("")),
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
  opts: { expiresAt?: Date | null; client?: Prisma.TransactionClient } = {},
) {
  const client = opts.client ?? db;
  const workspace = await client.workspace.create({
    data: {
      babyLabel: draft.babyLabel?.trim() || "Baby",
      lastName: draft.lastName?.trim() || null,
      dueDate: draft.dueDate ? new Date(draft.dueDate) : null,
      expiresAt: opts.expiresAt ?? null,
      suggestSlug: slugId(),
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
            name: draft.partner.name,
            email: draft.partner.email || null,
            color: PALETTE[1],
            token: nanoid(24),
          },
        ],
      },
    },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  return {
    workspace,
    owner: workspace.members.find((m) => m.isOwner)!,
    partner: workspace.members.find((m) => !m.isOwner)!,
  };
}
