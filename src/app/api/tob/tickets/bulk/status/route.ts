import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { tickets, products } from "@/drizzle/schema";
import { guardedTicketChange } from "@/lib/tickets/guarded-change";
import { TicketStatus } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import {
  assertManualStatusTarget,
  canTransition,
} from "@/lib/tickets/state-machine";
import { ticketIdsWithAgentReply } from "@/lib/tickets/agent-reply";
import { statusTransitionSlaUpdate } from "@/lib/tickets/sla";

const bulkStatusSchema = z.object({
  ticketIds: z.array(z.string().min(1)).min(1).max(100),
  status: z.enum(TicketStatus),
});

export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, bulkStatusSchema);
  assertManualStatusTarget(body.status);

  const rows = await ctx.db
    .select()
    .from(tickets)
    .where(
      and(inArray(tickets.id, body.ticketIds), ticketScopeCondition(ctx))
    );

  const now = new Date().toISOString();
  const results: { id: string; success: boolean; error?: string }[] = [];
  const foundIds = new Set(rows.map((r) => r.id));
  const productIds = [...new Set(rows.map((ticket) => ticket.productId))];
  const productRows = productIds.length
    ? await ctx.db
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const productsById = new Map(
    productRows.map((product) => [product.id, product])
  );

  for (const id of body.ticketIds) {
    if (!foundIds.has(id)) {
      results.push({ id, success: false, error: "Not found or not accessible" });
    }
  }

  const agentReplyTicketIds =
    body.status === TicketStatus.Replied
      ? await ticketIdsWithAgentReply(ctx.db, rows.map((ticket) => ticket.id))
      : null;

  for (const ticket of rows) {
    if (ticket.status === TicketStatus.Closed && ctx.apiKey && !ctx.apiKey.permissions.includes("reopen_ticket")) {
      results.push({ id: ticket.id, success: false, error: "API key does not permit reopening tickets" });
      continue;
    }
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
    if (agentReplyTicketIds && !agentReplyTicketIds.has(ticket.id)) {
      results.push({
        id: ticket.id,
        success: false,
        error: "Cannot mark as replied before a public agent reply exists",
      });
      continue;
    }

    const slaUpdate = statusTransitionSlaUpdate(
      ticket,
      body.status,
      productsById.get(ticket.productId),
      new Date(now),
    );

    const changed = await guardedTicketChange(
      ctx.db,
      ticket,
      {
        status: body.status, updatedAt: now, ...slaUpdate
      },
      {
        actorId: ctx.user.id,
        action: "status_changed",
        snapshot: JSON.stringify({
          previousStatus: ticket.status,
          newStatus: body.status,
          bulk: true,
        }),
        createdAt: now,
      },
    );
    if (!changed) {
      results.push({ id: ticket.id, success: false, error: "Ticket changed; reload before retrying" });
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
