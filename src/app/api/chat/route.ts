import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember } from "@/lib/session";
import { streamConsultant, extractSuggestions, type ConsultantContext, type ChatTurn } from "@/lib/consultant";
import { openingMessage } from "@/lib/opening";
import { namedParents } from "@/lib/seat";
import { babiesLabel, slotLabel, slots } from "@/lib/babies";

const schema = z.object({
  workspaceId: z.string(),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("invalid", { status: 400 });
  const { workspaceId, message } = parsed.data;

  // This one streams, so it answers in plain text rather than the shared JSON
  // refusal — but the check behind it is the same.
  const access = await getWritableMember(workspaceId);
  if (!access.ok) {
    return new Response(access.status === 402 ? "journey_expired" : "not_a_member", {
      status: access.status,
    });
  }
  const member = access.member;

  // Per-journey usage cap — a backstop so the cheap tiers stay profitable
  // against a rare power-user. Generous enough that a normal couple never
  // meets it; the reply is warm, not a wall.
  const cap = Number.parseInt(process.env.NAMESAKE_MSG_CAP || "120", 10);
  if (Number.isFinite(cap) && cap > 0) {
    const priorTurns = await db.chatMessage.count({ where: { workspaceId, role: "user" } });
    if (priorTurns >= cap) {
      return new Response(
        "We've talked through so much together — more than enough to trust what you're drawn to. " +
          "I'll always be here to read back over, but the deciding part is yours now, and I think you're closer than you feel. " +
          "Sit with your shortlist for a day; the right one tends to get quietly louder.",
        { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
  }

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
      // The *most recent* forty turns. Ascending order took the oldest forty
      // instead, so a long journey kept sending the model its opening
      // small-talk and none of the last hour — the consultant appeared to
      // forget everything the moment a couple really got going.
      messages: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!ws) return new Response("not_found", { status: 404 });

  // Babies who already have a name, and the ones still waiting. With twins
  // this is the whole shape of the conversation from the first decision on —
  // so it's fetched on its own rather than picked out of the shortlist above,
  // which is capped and could drop the one fact that matters most.
  const chosen = await db.nameEntry.findMany({
    where: { workspaceId, chosenSlot: { not: null } },
    orderBy: { chosenSlot: "asc" },
  });
  const chosenMiddles = new Map(
    chosen.filter((n) => n.role === "middle").map((n) => [n.chosenSlot!, n.firstName]),
  );
  const named = chosen
    .filter((n) => n.role !== "middle")
    .map((n) => ({
      slot: n.chosenSlot!,
      label: slotLabel(n.chosenSlot!),
      fullName: [n.firstName, chosenMiddles.get(n.chosenSlot!) ?? n.middleName, n.lastName ?? ws.lastName]
        .filter(Boolean)
        .join(" "),
    }));

  const ctx: ConsultantContext = {
    babyLabel: babiesLabel(ws.babyLabel, ws.babyCount),
    lastName: ws.lastName,
    babyCount: ws.babyCount,
    named: named.map(({ label, fullName }) => ({ label, fullName })),
    waiting: slots(ws.babyCount)
      .filter((s) => !named.some((n) => n.slot === s))
      .map(slotLabel),
    expecting: ws.expecting,
    // The panel paints an opening before anyone types. It goes in the system
    // prompt rather than the message list: a conversation has to begin with a
    // user turn, and leading with an assistant message is rejected on some
    // models — which broke every first message.
    opening: openingMessage({
      babyLabel: babiesLabel(ws.babyLabel, ws.babyCount),
      parents: namedParents(ws.members),
      babyCount: ws.babyCount,
    }),
    // Only people who are actually here. An unclaimed seat would otherwise
    // have the consultant addressing "Ada and Partner", or asking how the two
    // of them feel, to someone doing this on their own.
    members: ws.members.filter((m) => m.userId).map((m) => ({ name: m.name })),
    shortlist: ws.names
      .filter((n) => n.role !== "middle")
      .map((n) => ({
        firstName: n.firstName,
        middleName: n.middleName,
        status: n.status,
        ratings: n.ratings.map((r) => ({ member: r.member.name, score: r.score, veto: r.veto })),
        note: n.comments[0]?.body ?? null,
      })),
    middleShortlist: ws.names
      .filter((n) => n.role === "middle")
      .map((n) => ({
        name: n.firstName,
        ratings: n.ratings.map((r) => ({ member: r.member.name, score: r.score, veto: r.veto })),
      })),
    newSuggestions: ws.suggestions.map((s) => ({
      name: s.suggestedName,
      from: s.suggesterName,
      relationship: s.relationship,
      reason: s.reason,
    })),
  };

  // Back into the order they were said in — the query fetched them newest
  // first to get the right end of a long conversation.
  const history: ChatTurn[] = [...ws.messages]
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
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
        // Distinguish "never got going" from "died mid-sentence": the first is
        // almost always configuration — a model the key can't reach — and the
        // apology should read differently from a genuine interruption.
        const started = full.length > 0;
        const msg = started
          ? "\n\n(Sorry — I lost my thread there. Could you say that again?)"
          : "I couldn't reach my thoughts just then. Try me once more in a moment.";
        controller.enqueue(encoder.encode(msg));
        full += msg;

        const e = err as { status?: number; message?: string };
        console.error(
          `[namesake] consultant failed (model=${process.env.NAMESAKE_MODEL ?? "default"}, ` +
            `status=${e?.status ?? "none"}, started=${started}): ${e?.message ?? String(err)}`,
        );
      } finally {
        // A turn that produced nothing at all is not worth keeping: saved, it
        // becomes a blank bubble in the transcript and dead weight in every
        // later prompt. The parent's own message is already safely stored, so
        // dropping this loses nothing they wrote.
        const { clean } = extractSuggestions(full);
        const body = (clean || full).trim();
        if (body) {
          await db.chatMessage.create({
            data: { workspaceId, role: "assistant", content: body },
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
