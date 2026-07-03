import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { tickets, history, agents, agentTeams } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { isOpen } from "@/lib/tickets/state-machine";
import { emitTicketEvent } from "@/services/ticket-events";

const bulkAssignSchema = z.object({
  ticketIds: z.array(z.string().min(1)).min(1).max(100),
  assigneeId: z.string().min(1),
});

export const POST = withAuth({ permission: "ticket.assign" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, bulkAssignSchema);

  const assignee = await ctx.db
    .select({ userId: agents.userId })
    .from(agents)
    .where(and(eq(agents.userId, body.assigneeId), eq(agents.active, true)))
    .get();
  if (!assignee) throw badRequest("Assignee not found or inactive");

  // Teams the assignee belongs to (a ticket is only assignable if its team matches)
  const assigneeTeams = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .where(eq(agentTeams.userId, body.assigneeId));
  const assigneeTeamIds = new Set(assigneeTeams.map((t) => t.teamId));

  const rows = await ctx.db
    .select()
    .from(tickets)
    .where(
      and(inArray(tickets.id, body.ticketIds), ticketScopeCondition(ctx))
    );

  const now = new Date().toISOString();
  const results: { id: string; success: boolean; error?: string }[] = [];
  const foundIds = new Set(rows.map((r) => r.id));

  for (const id of body.ticketIds) {
    if (!foundIds.has(id)) {
      results.push({ id, success: false, error: "Not found or not accessible" });
    }
  }

  for (const ticket of rows) {
    if (!isOpen(ticket.status)) {
      results.push({ id: ticket.id, success: false, error: "Ticket is closed" });
      continue;
    }
    if (!assigneeTeamIds.has(ticket.teamId)) {
      results.push({ id: ticket.id, success: false, error: "Assignee not in ticket team" });
      continue;
    }

    const isReassign = Boolean(ticket.assigneeId);
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
          bulk: true,
        }),
        createdAt: now,
      }),
    ]);

    emitTicketEvent(ctx.db, {
      type: isReassign ? "ticket_reassigned" : "ticket_assigned",
      ticketId: ticket.id,
      agentId: body.assigneeId,
    });

    results.push({ id: ticket.id, success: true });
  }

  return ok({
    total: body.ticketIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});
