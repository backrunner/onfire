import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { tickets, history, agents, agentTeams, teams, products } from "@/drizzle/schema";
import { Role, TicketStatus, hasPermission } from "@/lib/types";
import { ok, notFound, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { isOpen } from "@/lib/tickets/state-machine";
import { computeSlaDeadlines } from "@/lib/tickets/sla";
import { emitTicketEvent } from "@/services/ticket-events";

const assignSchema = z.object({
  assigneeId: z.string().min(1),
});

/**
 * POST /api/tob/tickets/:id/assign — assign or reassign within the ticket's team.
 *
 * First assignment requires `ticket.assign`. Reassignment requires
 * `ticket.reassign`, except Agents may reassign within their own team when
 * the team has `allowReassign` enabled. Reassignment resets SLA timers.
 */
export const POST = withAuth({ permission: "ticket.assign" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (!isOpen(ticket.status)) {
    throw badRequest("Cannot assign a closed ticket");
  }

  const body = await parseBody(req, assignSchema);
  const isReassign = Boolean(ticket.assigneeId);

  if (isReassign) {
    if (!hasPermission(ctx.role, "ticket.reassign")) {
      // Agents may reassign within their own team when the team allows it.
      const team = await ctx.db.query.teams.findFirst({
        where: eq(teams.id, ticket.teamId),
      });
      const agentMayReassign =
        ctx.role === Role.Agent &&
        team?.allowReassign === true &&
        ctx.teamIds.includes(ticket.teamId);
      if (!agentMayReassign) {
        throw forbidden("Reassignment is not allowed for your role");
      }
    }
    if (ticket.assigneeId === body.assigneeId) {
      throw badRequest("Ticket is already assigned to this agent");
    }
  }

  // Assignee must be an active agent in the ticket's team
  const assignee = await ctx.db
    .select({ userId: agents.userId })
    .from(agents)
    .where(and(eq(agents.userId, body.assigneeId), eq(agents.active, true)))
    .get();
  if (!assignee) throw badRequest("Assignee not found or inactive");

  const inTeam = await ctx.db
    .select()
    .from(agentTeams)
    .where(
      and(
        eq(agentTeams.userId, body.assigneeId),
        eq(agentTeams.teamId, ticket.teamId)
      )
    )
    .get();
  if (!inTeam) throw badRequest("Assignee is not in the ticket's team");

  const now = new Date().toISOString();

  // Reassignment resets SLA timers from the product policy
  let slaReset = {};
  if (isReassign) {
    const product = await ctx.db.query.products.findFirst({
      where: eq(products.id, ticket.productId),
    });
    if (product) {
      slaReset = {
        ...computeSlaDeadlines(product, ticket.priority, new Date(now)),
        slaAcceptBreached: false,
        slaReplyBreached: false,
        slaAcceptWarned: false,
        slaReplyWarned: false,
      };
    }
  }

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({
        assigneeId: body.assigneeId,
        status:
          ticket.status === TicketStatus.New
            ? TicketStatus.Processing
            : ticket.status,
        updatedAt: now,
        ...slaReset,
      })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: isReassign ? "reassigned" : "assigned",
      snapshot: JSON.stringify({
        previousAssignee: ticket.assigneeId,
        newAssignee: body.assigneeId,
      }),
      createdAt: now,
    }),
  ]);

  emitTicketEvent(ctx.db, {
    type: isReassign ? "ticket_reassigned" : "ticket_assigned",
    ticketId: ticket.id,
    agentId: body.assigneeId,
  });

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
