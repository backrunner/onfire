import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, or, sql, count } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";

const listQuerySchema = z.object({
  productId: z.string().optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(TicketStatus).optional(),
  priority: z.enum(TicketPriority).optional(),
  overdue: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Priority-first ordering (high → medium → low), then most recently updated. */
const priorityWeight = sql`CASE ${tickets.priority}
  WHEN 'high' THEN 0
  WHEN 'medium' THEN 1
  ELSE 2 END`;

export const GET = withAuth({ permission: "ticket.read" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, listQuerySchema);

  const conditions = [ticketScopeCondition(ctx)];
  if (query.productId) conditions.push(eq(tickets.productId, query.productId));
  if (query.teamId) conditions.push(eq(tickets.teamId, query.teamId));
  if (query.assigneeId) conditions.push(eq(tickets.assigneeId, query.assigneeId));
  if (query.status) conditions.push(eq(tickets.status, query.status));
  if (query.priority) conditions.push(eq(tickets.priority, query.priority));
  if (query.overdue) {
    conditions.push(
      or(
        eq(tickets.slaAcceptBreached, true),
        eq(tickets.slaReplyBreached, true),
        sql`(${tickets.slaAcceptDeadline} IS NOT NULL AND ${tickets.slaAcceptDeadline} < ${new Date().toISOString()} AND ${tickets.status} = 'new')`,
        sql`(${tickets.slaReplyDeadline} IS NOT NULL AND ${tickets.slaReplyDeadline} < ${new Date().toISOString()} AND ${tickets.status} IN ('new','processing','escalated'))`
      )
    );
  }
  if (query.q) {
    const term = `%${query.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(
        sql`${tickets.subject} LIKE ${term}`,
        sql`${tickets.customerEmail} LIKE ${term}`,
        eq(tickets.id, query.q)
      )
    );
  }

  const where = and(...conditions.filter(Boolean));

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(tickets)
    .where(where);

  const rows = await ctx.db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(priorityWeight, desc(tickets.updatedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return ok({
    items: rows.map(serializeTicket),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  });
});
