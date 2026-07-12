import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, exists, or, sql, count } from "drizzle-orm";
import { customers, tickets } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { resolveUserNames, resolveCustomerExternalIds } from "@/lib/tickets/names";
import { activeSlaOverdueCondition } from "@/lib/tickets/sla";

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
    conditions.push(activeSlaOverdueCondition());
  }
  if (query.q) {
    conditions.push(
      or(
        sql`instr(lower(${tickets.subject}), lower(${query.q})) > 0`,
        sql`instr(lower(${tickets.customerEmail}), lower(${query.q})) > 0`,
        sql`instr(lower(${tickets.id}), lower(${query.q})) > 0`,
        exists(
          ctx.db
            .select({ value: sql<number>`1` })
            .from(customers)
            .where(
              and(
                eq(customers.id, tickets.customerId),
                sql`instr(lower(${customers.externalId}), lower(${query.q})) > 0`
              )
            )
        )
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

  const [names, customerRefs] = await Promise.all([
    resolveUserNames(
      ctx.db,
      rows.map((row) => row.assigneeId)
    ),
    resolveCustomerExternalIds(
      ctx.db,
      rows.filter((row) => !row.customerEmail).map((row) => row.customerId)
    ),
  ]);

  return ok({
    items: rows.map((row) => ({
      ...serializeTicket(row),
      assigneeName: row.assigneeId ? (names[row.assigneeId] ?? null) : null,
      customerLabel:
        row.customerEmail ??
        (row.customerId ? (customerRefs[row.customerId] ?? null) : null),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  });
});
