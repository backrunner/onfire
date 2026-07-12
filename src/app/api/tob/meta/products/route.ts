import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { productScopeCondition } from "@/lib/api/scope";

/**
 * GET /api/tob/meta/products — products visible to the current user.
 * Team-scoped roles see products linked to their teams; admins see all
 * products of their tenant(s).
 */
export const GET = withAuth({ permission: "agent.profile" }, async (_req: NextRequest, ctx) => {
  const rows = await ctx.db
    .select()
    .from(products)
    .where(productScopeCondition(ctx));
  return ok(rows);
});
