import { z } from "zod";
import { db } from "@/lib/db";
import { getMemberForWorkspace } from "@/lib/session";
import { streamConsultant, extractSuggestions, type ConsultantContext, type ChatTurn } from "@/lib/consultant";

const schema = z.object({
  workspaceId: z.string(),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("invalid", { status: 400 });
  const { workspaceId, message } = parsed.data;

  const member = await getMemberForWorkspace(workspaceId);
  if (!member) return new Response("not_a_member", { status: 403 });

  // Assemble the couple's current context for the consultant.
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { orderBy: { createdAt: "asc" } },
      names: {
        where: { status: { not: "vetoed" } },
        include: { ratings: { include: { member: true } }, comments: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      suggestions: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 10 },
      messages: { orderBy: { createdAt: "asc" }, take: 40 },
    },
  });
  if (!ws) return new Response("not_found", { status: 404 });

  const ctx: ConsultantContext = {
    babyLabel: ws.babyLabel,
    lastName: ws.lastName,
    members: ws.members.map((m) => ({ name: m.name })),
    shortlist: ws.names.map((n) => ({
      firstName: n.firstName,
      middleName: n.middleName,
      status: n.status,
      ratings: n.ratings.map((r) => ({ member: r.member.name, score: r.score, veto: r.veto })),
      note: n.comments[0]?.body ?? null,
    })),
    newSuggestions: ws.suggestions.map((s) => ({
      name: s.suggestedName,
      from: s.suggesterName,
      relationship: s.relationship,
      reason: s.reason,
    })),
  };

  const history: ChatTurn[] = ws.messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  history.push({ role: "user", content: message });

  // Persist the parent's message with attribution.
  await db.chatMessage.create({
    data: { workspaceId, memberId: member.id, role: "user", content: message },
  });

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamConsultant(ctx, history)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = "\n\n(Sorry — I lost my thread for a moment. Could you say that again?)";
        controller.enqueue(encoder.encode(msg));
        full += msg;
        console.error("consultant stream error", err);
      } finally {
        const { clean } = extractSuggestions(full);
        await db.chatMessage.create({
          data: { workspaceId, role: "assistant", content: clean || full },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
