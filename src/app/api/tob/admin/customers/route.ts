import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, like, or, count } from "drizzle-orm";
import { customers } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";

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
  if (query.productId) conditions.push(eq(customers.productId, query.productId));
  if (query.q) {
    const term = `%${query.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(like(customers.email, term), like(customers.externalId, term))
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
