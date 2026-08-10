import { z } from "zod";
import { db } from "@/lib/db";
import { getWritableMember } from "@/lib/session";
import { streamConsultant, extractSuggestions, type ConsultantContext, type ChatTurn } from "@/lib/consultant";
import { openingMessage } from "@/lib/opening";
import { claimTurn, releaseTurn, turnHolder } from "@/lib/turn";
import { namedParents } from "@/lib/seat";
import { babiesLabel, slotLabel, slots } from "@/lib/babies";
import { FREE_TURNS } from "@/lib/trial";
import { trackFunnel } from "@/lib/analytics";
import { FUNNEL } from "@/lib/funnel";

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

  // The free trial, spent one turn at a time.
  //
  // After the per-journey cap above, not before: a turn the cap is about to
  // refuse is not a turn anybody got, and charging one of ten for it would be
  // the same unfairness the refund below exists to undo.
  //
  // Read the journey first. A turn only costs an allowance where nobody has
  // paid — otherwise somebody who buys on day one quietly burns their lifetime
  // ten inside the journey they paid for, and finds nothing left if they ever
  // start a second. That is the sort of thing you discover from a support
  // email rather than from a test.
  const journey = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { isTrial: true },
  });
  if (!journey) return new Response("not_found", { status: 404 });

  // Set once a turn has actually been taken off this person, so the failure
  // path below can put it back.
  let spentFreeTurn = false;

  if (journey.isTrial) {
    // `getWritableMember` found this seat by the signed-in user's id, so the
    // seat has one. The `??` is the type system's question, not a real case.
    const userId = member.userId ?? "";

    // A conditional update rather than read-then-write: two tabs, or two taps
    // on a slow phone, would otherwise both read nine and both spend the
    // tenth. The same shape the codebase already uses to spend a login token
    // and to spend a purchase — one statement, and the database decides who
    // won.
    //
    // Raw, rather than `updateMany`, only for the RETURNING. `wall_reached`
    // has to fire exactly once per person or it is useless as a denominator,
    // and updating and then reading back would let two concurrent turns both
    // see the limit and both report it. RETURNING hands each statement the
    // value *it* produced, so precisely one of them comes back holding the
    // last turn.
    const spent = await db.$queryRaw<{ freeTurnsUsed: number }[]>`
      update "User"
         set "freeTurnsUsed" = "freeTurnsUsed" + 1
       where "id" = ${userId}
         and "freeTurnsUsed" < ${FREE_TURNS}
      returning "freeTurnsUsed"
    `;
    if (spent.length === 0) {
      // Its own code, not the 402 an expired journey gets. The two are
      // different sentences on screen and — more to the point — different
      // states: this journey is not over, this *person* is out of turns, and
      // their partner may still have some.
      return new Response("free_trial_used", {
        status: 402,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    spentFreeTurn = true;

    // That was their last one. The moment worth counting: everyone who gets
    // here has used the product properly and is now looking at a price, so
    // this is the denominator for whether $20 is the right number. Fired here
    // rather than when the wall renders or when the next turn is refused,
    // because both of those repeat every time the person comes back.
    //
    // Not awaited into the request's critical path — a couple of hundred
    // milliseconds of analytics has no business sitting between somebody and
    // their consultant. It logs its own failures.
    if (spent[0].freeTurnsUsed >= FREE_TURNS) {
      void trackFunnel(FUNNEL.wallReached, { turns: FREE_TURNS }, request.headers);
    }
  }

  // Take the conversation before reading it, not after.
  //
  // Everything the consultant is about to be told is built from one snapshot
  // of the transcript, and that snapshot is only worth anything if nobody can
  // be halfway through adding to it. Two questions in flight at once produced
  // two replies composed from transcripts each missing the other's question —
  // and then stored in the order they *finished*, so one parent's answer got
  // filed under the other's question. Every later turn read that back.
  //
  // The refusal is deliberately not a queue. Two people on the same sofa
  // shouldn't get two consultants talking over each other; the other screen is
  // already showing that a question is in flight, and this only has to catch
  // the second or two before it knows.
  /// Give a free turn back. Only ever called when the consultant produced
  /// nothing whatsoever — a turn that was refused before it started, or one
  /// where the model never said a word. Charging somebody one of ten for our
  /// own outage is the kind of small unfairness nobody reports and everybody
  /// remembers.
  ///
  /// Guarded above zero so a double refund can't run the count backwards into
  /// a free turn nobody was given.
  const refundFreeTurn = async () => {
    if (!spentFreeTurn) return;
    spentFreeTurn = false;
    await db.user
      .updateMany({
        where: { id: member.userId ?? "", freeTurnsUsed: { gt: 0 } },
        data: { freeTurnsUsed: { decrement: 1 } },
      })
      .catch((err) => console.error("[namesake] could not return a free turn", err));
  };

  if (!(await claimTurn(workspaceId, member.id))) {
    // Refused before a word was said: their question is still in the box and
    // they will send it again in a moment.
    await refundFreeTurn();
    // Say who actually has it. The screen can otherwise only guess — "the
    // other parent" — which is right in the ordinary race and wrong for
    // someone who left a turn running in another tab, and telling one of them
    // their partner is asking when their partner isn't is a small lie we
    // already know the answer to.
    const holder = await currentHolder(workspaceId);
    return new Response("turn_in_progress", {
      status: 409,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        ...(holder ? { "X-Turn-Holder": encodeURIComponent(holder) } : {}),
      },
    });
  }

  // From here the turn is held, so every way out of this function has to give
  // it back — including the ones nobody planned. Left held, a request that
  // never said a word would lock the other parent out until it went stale.
  let opened: Awaited<ReturnType<typeof openTurn>>;
  try {
    opened = await openTurn(workspaceId, message, member);
  } catch (err) {
    await releaseTurn(workspaceId, member.id);
    await refundFreeTurn();
    throw err;
  }
  if (!opened) {
    await releaseTurn(workspaceId, member.id);
    await refundFreeTurn();
    return new Response("not_found", { status: 404 });
  }
  const { ctx, history } = opened;

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

        // Nothing at all came back — almost always configuration, a model the
        // key can't reach. Not their fault and not worth one of their ten.
        // A reply that died *mid-sentence* is not refunded: they got an
        // answer, it is in the transcript, and the consultant read their
        // question to produce it.
        if (!started) await refundFreeTurn();

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
        // Only now. Released after the reply is written rather than before, so
        // whoever goes next reads a transcript with this whole exchange
        // already in it, rather than one with a question left hanging.
        await releaseTurn(workspaceId, member.id);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/// The name of whoever is mid-question, for the refusal above. Best-effort:
/// they may well have finished by the time this reads, and a turn nobody can
/// name is still a turn — the refusal stands either way.
async function currentHolder(workspaceId: string): Promise<string | null> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { turnMemberId: true, turnStartedAt: true, members: { select: { id: true, name: true } } },
  });
  if (!ws) return null;
  const id = turnHolder(ws);
  return id ? (ws.members.find((m) => m.id === id)?.name ?? null) : null;
}

/// Read the whole conversation, and add this parent's message to the end of
/// it. Runs while the turn is held, so what it reads can't shift underneath.
///
/// Returns what the consultant needs to answer, or null if the journey has
/// gone. Its own function so the lock above has a single call to guard rather
/// than a hundred lines to wrap.
async function openTurn(
  workspaceId: string,
  message: string,
  member: { id: string; name: string },
) {
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
      // `member` comes along because a turn is not just words — it's words
      // said by one of two people, and which one changes what they mean.
      messages: { orderBy: { createdAt: "desc" }, take: 40, include: { member: true } },
    },
  });
  if (!ws) return null;

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

  // Only people who are actually here. An unclaimed seat would otherwise have
  // the consultant addressing "Ada and Partner", or asking how the two of them
  // feel, to someone doing this on their own.
  const joined = ws.members.filter((m) => m.userId);

  // With two parents writing into one thread, the model needs to know which of
  // them is speaking — see `attributed` in ConsultantContext. With one, the
  // labels would be noise.
  const attributed = joined.length > 1;

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
    members: joined.map((m) => ({ name: m.name })),
    attributed,
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

  // Who said it, in the words themselves. Both parents share the single `user`
  // role the API gives us, so attribution has nowhere else to live — and the
  // prefix is the same name their bubble already carries on screen, so the
  // consultant and the couple are looking at the same conversation.
  //
  // A seat can lose its member (deleted user, SetNull), which leaves a real
  // message with nobody attached. Better an anonymous parent than a silent
  // relabelling of their words as the other one's.
  const say = (name: string | null | undefined, content: string) =>
    attributed ? `${name?.trim() || "A parent"}: ${content}` : content;

  // Back into the order they were said in — the query fetched them newest
  // first to get the right end of a long conversation.
  const history: ChatTurn[] = [...ws.messages]
    .reverse()
    .map((m) =>
      m.role === "assistant"
        ? { role: "assistant" as const, content: m.content }
        : { role: "user" as const, content: say(m.member?.name, m.content) },
    );

  history.push({ role: "user", content: say(member.name, message) });

  // Persist the parent's message with attribution.
  await db.chatMessage.create({
    data: { workspaceId, memberId: member.id, role: "user", content: message },
  });

  return { ctx, history };
}
