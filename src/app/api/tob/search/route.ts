import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, or, desc, exists, sql, inArray } from "drizzle-orm";
import { customers, tickets, products, teams } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";
import { activeSlaOverdueCondition, isTicketSlaOverdue } from "@/lib/tickets/sla";
import { translationSearchCondition } from "@/lib/tickets/search";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(TicketStatus).optional(),
  priority: z.enum(TicketPriority).optional(),
  productId: z.string().optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
  customerEmail: z.string().max(320).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  overdue: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth({ permission: "ticket.read" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, searchQuerySchema);

  // Access control — team/tenant scoped ticket visibility
  const conditions = [ticketScopeCondition(ctx)];

  // Text search (subject, content, customer email, ticket ID)
  if (query.q) {
    conditions.push(
      or(
        sql`instr(lower(${tickets.subject}), lower(${query.q})) > 0`,
        translationSearchCondition(tickets.subjectTranslations, query.q),
        sql`instr(lower(${tickets.content}), lower(${query.q})) > 0`,
        translationSearchCondition(tickets.contentTranslations, query.q),
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

  if (query.status) conditions.push(eq(tickets.status, query.status));
  if (query.priority) conditions.push(eq(tickets.priority, query.priority));
  if (query.productId) conditions.push(eq(tickets.productId, query.productId));
  if (query.teamId) conditions.push(eq(tickets.teamId, query.teamId));

  if (query.assigneeId) {
    if (query.assigneeId === "unassigned") {
      conditions.push(sql`${tickets.assigneeId} IS NULL`);
    } else {
      conditions.push(eq(tickets.assigneeId, query.assigneeId));
    }
  }

  if (query.customerEmail) {
    conditions.push(
      sql`instr(lower(${tickets.customerEmail}), lower(${query.customerEmail})) > 0`
    );
  }

  if (query.dateFrom) {
    conditions.push(sql`${tickets.createdAt} >= ${query.dateFrom}`);
  }
  if (query.dateTo) {
    conditions.push(sql`${tickets.createdAt} <= ${query.dateTo}`);
  }

  if (query.overdue) {
    conditions.push(activeSlaOverdueCondition());
  }

  const whereClause = and(...conditions.filter(Boolean));

  const [ticketResults, countResult] = await Promise.all([
    ctx.db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        priority: tickets.priority,
        customerEmail: tickets.customerEmail,
        customerExternalId: customers.externalId,
        productId: tickets.productId,
        teamId: tickets.teamId,
        assigneeId: tickets.assigneeId,
        slaAcceptBreached: tickets.slaAcceptBreached,
        slaReplyBreached: tickets.slaReplyBreached,
        slaAcceptDeadline: tickets.slaAcceptDeadline,
        slaReplyDeadline: tickets.slaReplyDeadline,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .leftJoin(customers, eq(customers.id, tickets.customerId))
      .where(whereClause)
      .orderBy(desc(tickets.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count || 0;

  // Resolve product and team names for the results (IDs come from
  // already-scoped tickets, so no extra tenant filtering needed)
  const productIdsFromResults = [...new Set(ticketResults.map((t) => t.productId))];
  const teamIdsFromResults = [...new Set(ticketResults.map((t) => t.teamId))];

  const [productList, teamList] = await Promise.all([
    productIdsFromResults.length > 0
      ? ctx.db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(inArray(products.id, productIdsFromResults))
      : [],
    teamIdsFromResults.length > 0
      ? ctx.db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, teamIdsFromResults))
      : [],
  ]);

  const productMap = new Map(productList.map((p) => [p.id, p.name]));
  const teamMap = new Map(teamList.map((t) => [t.id, t.name]));

  const results = ticketResults.map((ticket) => ({
    ...ticket,
    customerLabel: ticket.customerEmail ?? ticket.customerExternalId,
    productName: productMap.get(ticket.productId) || "",
    teamName: teamMap.get(ticket.teamId) || "",
    isOverdue: isTicketSlaOverdue(ticket),
  }));

  return ok({
    tickets: results,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
});
