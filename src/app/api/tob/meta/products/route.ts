import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { isTeamScoped, tenantCondition } from "@/lib/api/scope";

/**
 * GET /api/tob/meta/products — products visible to the current user.
 * Team-scoped roles see products linked to their teams; admins see all
 * products of their tenant(s).
 */
export const GET = withAuth({ permission: "agent.profile" }, async (_req: NextRequest, ctx) => {
  if (isTeamScoped(ctx)) {
    if (ctx.productIds.length === 0) return ok([]);
    const rows = await ctx.db
      .select()
      .from(products)
      .where(inArray(products.id, ctx.productIds));
    return ok(rows);
  }

  const rows = await ctx.db
    .select()
    .from(products)
    .where(tenantCondition(ctx, products.tenantId));
  return ok(rows);
});
