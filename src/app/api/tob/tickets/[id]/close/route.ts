import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { emitTicketEvent } from "@/services/ticket-events";

const closeSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const POST = withAuth({ permission: "ticket.close" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("Ticket is already closed");
  }

  const body = await parseBody(req, closeSchema);
  const now = new Date().toISOString();

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ status: TicketStatus.Closed, updatedAt: now })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "closed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        reason: body.reason,
      }),
      createdAt: now,
    }),
  ]);

  emitTicketEvent(ctx.db, {
    type: "ticket_closed",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
  });

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
