import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { tickets, history, products } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import {
  assertManualStatusTarget,
  canTransition,
} from "@/lib/tickets/state-machine";
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

    const slaUpdate = statusTransitionSlaUpdate(
      ticket,
      body.status,
      productsById.get(ticket.productId),
      new Date(now),
    );

    await ctx.db.batch([
      ctx.db
        .update(tickets)
        .set({ status: body.status, updatedAt: now, ...slaUpdate })
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

    results.push({ id: ticket.id, success: true });
  }

  return ok({
    total: body.ticketIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});
