import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, badRequest } from "@/lib/api/response";
import { withCustomerAuth, parseBody } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { chooseEscalationAssignee } from "@/services/allocation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitTicketEvent } from "@/services/ticket-events";

const escalateSchema = z.object({
  reason: z.string().max(2000).optional(),
});

/**
 * POST /api/toc/tickets/:id/escalate — customer-requested escalation to a
 * higher-level agent in the handling team.
 */
export const POST = withCustomerAuth(async (req: NextRequest, ctx) => {
  await enforceRateLimit(
    ctx.db,
    req,
    "toc:escalate",
    { limit: 5, windowSeconds: 300 },
    ctx.customer.sub
  );

  const ticket = await loadCustomerTicket(ctx, ctx.params.id);

  if (ticket.status === TicketStatus.Closed) {
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
    throw badRequest("No higher-level agent is currently available");
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
      action: "escalated",
      snapshot: JSON.stringify({
        previousAssignee: ticket.assigneeId,
        newAssignee: newAssignee.id,
        reason: body.reason,
        requestedBy: "customer",
      }),
      createdAt: now,
    }),
  ]);

  emitTicketEvent(ctx.db, {
    type: "ticket_escalated",
    ticketId: ticket.id,
    agentId: newAssignee.id,
  });

  return ok({ status: TicketStatus.Escalated });
});
