import { NextRequest } from "next/server";
import { z } from "zod";
import { and, inArray } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ApiError, ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { closeTicket } from "@/services/ticket-close";
import { closeTicketSchema } from "@/lib/tickets/close-schema";

const bulkCloseSchema = closeTicketSchema.extend({
  ticketIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withAuth({ permission: "ticket.close" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, bulkCloseSchema);

  const rows = await ctx.db
    .select()
    .from(tickets)
    .where(
      and(inArray(tickets.id, body.ticketIds), ticketScopeCondition(ctx))
    );

  const results: { id: string; success: boolean; error?: string }[] = [];
  const foundIds = new Set(rows.map((r) => r.id));

  for (const id of body.ticketIds) {
    if (!foundIds.has(id)) {
      results.push({ id, success: false, error: "Not found or not accessible" });
    }
  }

  for (const ticket of rows) {
    if (ticket.status === TicketStatus.Closed) {
      results.push({ id: ticket.id, success: false, error: "Already closed" });
      continue;
    }

    try {
      await closeTicket(ctx.db, ticket, ctx.user.id, { reason: body.reason, notifyCustomer: body.notifyCustomer, bulk: true });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      results.push({ id: ticket.id, success: false, error: error.message });
      continue;
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
