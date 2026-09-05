import { NextRequest } from "next/server";
import { desc, sql, count } from "drizzle-orm";
import { tickets, products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { ticketScopeCondition, productScopeCondition } from "@/lib/api/scope";
import { activeSlaOverdueCondition } from "@/lib/tickets/sla";

export const GET = withAuth({ permission: "ticket.read" }, async (_req: NextRequest, ctx) => {
  const scope = ticketScopeCondition(ctx);
  const now = new Date().toISOString();

  // Aggregate in the database instead of loading all tickets into memory.
  // "Overdue" counts persisted breach flags OR live deadline comparison.
  const [statsRow] = await ctx.db
    .select({
      pending: sql<number>`COUNT(CASE WHEN ${tickets.status} IN ('new', 'processing') THEN 1 END)`,
      escalated: sql<number>`COUNT(CASE WHEN ${tickets.status} = 'escalated' THEN 1 END)`,
      overdue: sql<number>`COUNT(CASE WHEN ${activeSlaOverdueCondition(now)} THEN 1 END)`,
      handled: sql<number>`COUNT(CASE WHEN ${tickets.status} IN ('replied', 'closed') THEN 1 END)`,
    })
    .from(tickets)
    .where(scope);

  const stats = statsRow || { pending: 0, escalated: 0, overdue: 0, handled: 0 };

  const [productCountRow] = await ctx.db
    .select({ count: count() })
    .from(products)
    .where(productScopeCondition(ctx));

  const recentTickets = await ctx.db
    .select()
    .from(tickets)
    .where(scope)
    .orderBy(desc(tickets.createdAt))
    .limit(5);

  const response = ok({
    stats: {
      pending: Number(stats.pending),
      escalated: Number(stats.escalated),
      overdue: Number(stats.overdue),
      handled: Number(stats.handled),
      products: Number(productCountRow?.count || 0),
    },
    recentTickets,
  });

  // SWR owns the UI cache. HTTP caching would hide browser-tool mutations
  // and could retain statistics from a previous role or preview identity.
  response.headers.set("Cache-Control", "no-store");

  return response;
});
