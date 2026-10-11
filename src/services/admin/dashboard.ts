import { desc, sql, count } from "drizzle-orm";
import { tickets, products } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import type { DashboardResponse } from "@/lib/api/types";
import { ticketScopeCondition, productScopeCondition } from "@/lib/api/scope";
import { activeSlaOverdueCondition } from "@/lib/tickets/sla";

export async function getDashboard(ctx: AuthedContext): Promise<DashboardResponse> {
  const scope = ticketScopeCondition(ctx);
  const now = new Date().toISOString();

  // Aggregate in the database instead of loading all tickets into memory.
  // "Overdue" counts persisted breach flags OR live deadline comparison.
  const [[statsRow], [productCountRow], recentTickets] = await ctx.db.batch([
    ctx.db
      .select({
        pending: sql<number>`COUNT(CASE WHEN ${tickets.status} IN ('new', 'processing') THEN 1 END)`,
        escalated: sql<number>`COUNT(CASE WHEN ${tickets.status} = 'escalated' THEN 1 END)`,
        overdue: sql<number>`COUNT(CASE WHEN ${activeSlaOverdueCondition(now)} THEN 1 END)`,
        handled: sql<number>`COUNT(CASE WHEN ${tickets.status} IN ('replied', 'closed') THEN 1 END)`,
      })
      .from(tickets)
      .where(scope),
    ctx.db
      .select({ count: count() })
      .from(products)
      .where(productScopeCondition(ctx)),
    ctx.db
      .select({
        id: tickets.id, tenantId: tickets.tenantId, productId: tickets.productId, teamId: tickets.teamId,
        subject: tickets.subject, status: tickets.status, priority: tickets.priority, createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(scope)
      .orderBy(desc(tickets.createdAt))
      .limit(5),
  ]);

  const stats = statsRow || { pending: 0, escalated: 0, overdue: 0, handled: 0 };

  return {
    stats: {
      pending: Number(stats.pending),
      escalated: Number(stats.escalated),
      overdue: Number(stats.overdue),
      handled: Number(stats.handled),
      products: Number(productCountRow?.count || 0),
    },
    recentTickets,
  };
}
