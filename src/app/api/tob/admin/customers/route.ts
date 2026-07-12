import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, exists, inArray, or, count, sql } from "drizzle-orm";
import { customers, tickets } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { isTeamScoped, tenantCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const querySchema = z.object({
  productId: z.string().optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * GET /api/tob/admin/customers — customer directory (tenant-scoped),
 * searchable by email or external ID.
 */
export const GET = withAuth({ permission: "customer.read" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, querySchema);

  const conditions = [tenantCondition(ctx, customers.tenantId)];
  if (ctx.role === Role.ProductAdmin) {
    conditions.push(
      inArray(
        customers.productId,
        ctx.productIds.length > 0 ? ctx.productIds : ["__none__"]
      )
    );
  } else if (isTeamScoped(ctx)) {
    const teamIds = ctx.teamIds.length > 0 ? ctx.teamIds : ["__none__"];
    conditions.push(
      exists(
        ctx.db
          .select({ value: sql<number>`1` })
          .from(tickets)
          .where(
            and(
              inArray(tickets.teamId, teamIds),
              eq(tickets.productId, customers.productId),
              or(
                eq(tickets.customerId, customers.id),
                sql`(${customers.email} IS NOT NULL AND lower(${tickets.customerEmail}) = lower(${customers.email}))`
              )
            )
          )
      )
    );
  }
  if (query.productId) conditions.push(eq(customers.productId, query.productId));
  if (query.q) {
    conditions.push(
      or(
        sql`instr(lower(${customers.email}), lower(${query.q})) > 0`,
        sql`instr(lower(${customers.externalId}), lower(${query.q})) > 0`
      )
    );
  }
  const where = and(...conditions.filter(Boolean));

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(customers)
    .where(where);

  const rows = await ctx.db
    .select()
    .from(customers)
    .where(where)
    .orderBy(desc(customers.updatedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return ok({ items: rows, total, page: query.page, pageSize: query.pageSize });
});
