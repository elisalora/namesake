import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember, writeDenied } from "@/lib/session";

const schema = z.object({
  workspaceId: z.string(),
  /// A middle-name candidate is the same kind of thing as a first-name one,
  /// weighed the same way. `firstName` holds the name either way.
  role: z.enum(["first", "middle"]).optional(),
  firstName: z.string().trim().min(1).max(60),
  middleName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  gender: z.enum(["girl", "boy", "neutral"]).optional(),
  origin: z.string().trim().max(120).optional(),
  meaning: z.string().trim().max(280).optional(),
  source: z.enum(["parent", "suggestion", "ai"]).optional(),
  suggestionId: z.string().optional(),
  // If the name comes from a suggestion, carry the suggester's note as a comment.
  seedComment: z.object({ authorName: z.string(), body: z.string() }).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const data = parsed.data;

  const access = await getWritableMember(data.workspaceId);
  if (!access.ok) return writeDenied(access);

  // The membership check above is on `workspaceId`; the suggestion id arrives
  // separately and belongs to whatever journey it was left on. Checked here,
  // before anything is written, so a stale or foreign id can't leave a name
  // behind after the update fails — and can't mark someone else's suggestion
  // imported, quietly hiding it from the couple who were waiting for it.
  if (data.suggestionId) {
    const suggestion = await db.suggestion.findUnique({
      where: { id: data.suggestionId },
      select: { workspaceId: true },
    });
    if (!suggestion || suggestion.workspaceId !== data.workspaceId) {
      return NextResponse.json({ error: "That suggestion isn't in this journey." }, { status: 404 });
    }
  }

  const name = await db.nameEntry.create({
    data: {
      workspaceId: data.workspaceId,
      role: data.role || "first",
      firstName: data.firstName,
      // A middle-name candidate is one word; anything typed after it belongs
      // to the first name it'll sit beside, not to this entry.
      middleName: (data.role === "middle" ? null : data.middleName) || null,
      lastName: data.lastName || null,
      gender: data.gender || null,
      origin: data.origin || null,
      meaning: data.meaning || null,
      source: data.source || "parent",
      suggestionId: data.suggestionId || null,
      status: "shortlist",
      comments: data.seedComment
        ? {
            create: {
              workspaceId: data.workspaceId,
              authorName: data.seedComment.authorName,
              body: data.seedComment.body,
            },
          }
        : undefined,
    },
  });

  if (data.suggestionId) {
    // `updateMany` so the workspace scope is part of the write itself, and so a
    // suggestion deleted between the check and here is a no-op rather than an
    // unhandled P2025 thrown after the name row already exists.
    await db.suggestion.updateMany({
      where: { id: data.suggestionId, workspaceId: data.workspaceId },
      data: { status: "imported" },
    });
  }

  return NextResponse.json({ id: name.id });
}
