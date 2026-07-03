import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, replies, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket, serializeHistory } from "@/lib/tickets/serialize";
import { isOpen } from "@/lib/tickets/state-machine";
import { emitTicketEvent } from "@/services/ticket-events";

const replySchema = z.object({
  content: z.string().min(1).max(20_000),
  internal: z.boolean().default(false),
});

export const GET = withAuth({ permission: "ticket.read" }, async (_req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  const [replyRows, historyRows] = await Promise.all([
    ctx.db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, ticket.id))
      .orderBy(replies.createdAt),
    ctx.db
      .select()
      .from(history)
      .where(eq(history.ticketId, ticket.id))
      .orderBy(history.createdAt),
  ]);

  const timeline = [
    ...serializeHistory(historyRows).map((h) => ({ type: "history" as const, ...h })),
    ...replyRows.map((r) => ({ type: "reply" as const, ...r })),
  ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  return ok({
    ticket: serializeTicket(ticket),
    replies: replyRows,
    history: serializeHistory(historyRows),
    timeline,
  });
});

/**
 * POST /api/tob/tickets/:id — agent reply (or internal note).
 * Internal notes never change ticket status and are invisible to customers.
 */
export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  const body = await parseBody(req, replySchema);

  if (!isOpen(ticket.status) && !body.internal) {
    throw badRequest("Cannot reply to a closed ticket");
  }

  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();

  const statements = [
    ctx.db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderId: ctx.user.id,
      content: body.content,
      internal: body.internal,
      createdAt: now,
    }),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: body.internal ? "internal_note" : "agent_replied",
      createdAt: now,
    }),
  ] as const;

  if (body.internal) {
    await ctx.db.batch([...statements]);
  } else {
    await ctx.db.batch([
      ...statements,
      ctx.db
        .update(tickets)
        .set({ status: TicketStatus.Replied, updatedAt: now })
        .where(eq(tickets.id, ticket.id)),
    ]);
    emitTicketEvent(ctx.db, {
      type: "agent_replied",
      ticketId: ticket.id,
      agentId: ctx.user.id,
      replyId,
    });
  }

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });

  return ok({
    ticket: updated ? serializeTicket(updated) : null,
    reply: { id: replyId, content: body.content, internal: body.internal, createdAt: now },
  });
});
