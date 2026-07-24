import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMemberForWorkspace } from "@/lib/session";

const schema = z.object({
  workspaceId: z.string(),
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

  const member = await getMemberForWorkspace(data.workspaceId);
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const name = await db.nameEntry.create({
    data: {
      workspaceId: data.workspaceId,
      firstName: data.firstName,
      middleName: data.middleName || null,
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
    await db.suggestion.update({ where: { id: data.suggestionId }, data: { status: "imported" } });
  }

  return NextResponse.json({ id: name.id });
}
