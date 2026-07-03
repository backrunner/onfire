import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { tickets, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { canTransition } from "@/lib/tickets/state-machine";
import { emitTicketEvent } from "@/services/ticket-events";

const bulkStatusSchema = z.object({
  ticketIds: z.array(z.string().min(1)).min(1).max(100),
  status: z.enum(TicketStatus),
});

export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, bulkStatusSchema);

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
    if (ticket.status === body.status) {
      results.push({ id: ticket.id, success: false, error: "Status unchanged" });
      continue;
    }
    if (!canTransition(ticket.status, body.status)) {
      results.push({
        id: ticket.id,
        success: false,
        error: `Invalid transition: ${ticket.status} → ${body.status}`,
      });
      continue;
    }

    await ctx.db.batch([
      ctx.db
        .update(tickets)
        .set({ status: body.status, updatedAt: now })
        .where(eq(tickets.id, ticket.id)),
      ctx.db.insert(history).values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: "status_changed",
        snapshot: JSON.stringify({
          previousStatus: ticket.status,
          newStatus: body.status,
          bulk: true,
        }),
        createdAt: now,
      }),
    ]);

    if (body.status === TicketStatus.Closed) {
      emitTicketEvent(ctx.db, {
        type: "ticket_closed",
        ticketId: ticket.id,
        agentId: ticket.assigneeId ?? undefined,
      });
    }

    results.push({ id: ticket.id, success: true });
  }

  return ok({
    total: body.ticketIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});
