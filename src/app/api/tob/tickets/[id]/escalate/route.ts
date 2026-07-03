import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { isOpen } from "@/lib/tickets/state-machine";
import { chooseEscalationAssignee } from "@/services/allocation";
import { emitTicketEvent } from "@/services/ticket-events";

const escalateSchema = z.object({
  reason: z.string().max(2000).optional(),
});

/**
 * POST /api/tob/tickets/:id/escalate — escalate to a higher-level agent in
 * the same team, chosen by the load-balancing algorithm.
 */
export const POST = withAuth({ permission: "ticket.escalate" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (!isOpen(ticket.status)) {
    throw badRequest("Cannot escalate a closed ticket");
  }
  if (ticket.status === TicketStatus.Escalated) {
    throw badRequest("Ticket is already escalated");
  }

  const body = await parseBody(req, escalateSchema);

  const newAssignee = await chooseEscalationAssignee(
    ctx.db,
    ticket.teamId,
    ticket.assigneeId
  );
  if (!newAssignee) {
    throw badRequest("No higher-level agent available for escalation");
  }

  const now = new Date().toISOString();

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({
        assigneeId: newAssignee.id,
        status: TicketStatus.Escalated,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "escalated",
      snapshot: JSON.stringify({
        previousAssignee: ticket.assigneeId,
        newAssignee: newAssignee.id,
        newAssigneeLevel: newAssignee.level,
        reason: body.reason,
      }),
      createdAt: now,
    }),
  ]);

  emitTicketEvent(ctx.db, {
    type: "ticket_escalated",
    ticketId: ticket.id,
    agentId: newAssignee.id,
  });

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({
    ticket: updated ? serializeTicket(updated) : null,
    escalatedTo: {
      id: newAssignee.id,
      displayName: newAssignee.displayName,
      level: newAssignee.level,
    },
  });
});
