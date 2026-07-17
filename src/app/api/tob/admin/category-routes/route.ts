import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { categoryRoutes, products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

export const GET = withAuth({ permission: "ticket_type.route" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, listQuerySchema);

  if (productId) {
    await assertProductAccess(ctx, productId);
    const routeList = await ctx.db
      .select()
      .from(categoryRoutes)
      .where(
        ctx.role === Role.TeamAdmin
          ? and(
              eq(categoryRoutes.productId, productId),
              inArray(
                categoryRoutes.teamId,
                ctx.teamIds.length ? ctx.teamIds : ["__none__"]
              )
            )
          : eq(categoryRoutes.productId, productId)
      );
    return ok(routeList);
  }

  const accessible = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(productScopeCondition(ctx));
  const productIds = accessible.map((p) => p.id);
  if (productIds.length === 0) return ok([]);

  const routeList = await ctx.db
    .select()
    .from(categoryRoutes)
    .where(
      ctx.role === Role.TeamAdmin
        ? and(
            inArray(categoryRoutes.productId, productIds),
            inArray(
              categoryRoutes.teamId,
              ctx.teamIds.length ? ctx.teamIds : ["__none__"]
            )
          )
        : inArray(categoryRoutes.productId, productIds)
  );
  return ok(routeList);
});
