import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { categoryRoutes, products } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess, tenantCondition } from "@/lib/api/scope";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

const createRouteSchema = z.object({
  productId: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  teamId: z.string().min(1),
});

export const GET = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, listQuerySchema);

  if (productId) {
    await assertProductAccess(ctx, productId);
    const routeList = await ctx.db
      .select()
      .from(categoryRoutes)
      .where(eq(categoryRoutes.productId, productId));
    return ok(routeList);
  }

  const accessible = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(tenantCondition(ctx, products.tenantId));
  const productIds = accessible.map((p) => p.id);
  if (productIds.length === 0) return ok([]);

  const routeList = await ctx.db
    .select()
    .from(categoryRoutes)
    .where(inArray(categoryRoutes.productId, productIds));
  return ok(routeList);
});

export const POST = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createRouteSchema);
  await assertProductAccess(ctx, body.productId);

  const id = crypto.randomUUID();

  await ctx.db.insert(categoryRoutes).values({
    id,
    productId: body.productId,
    category: body.category,
    subcategory: body.subcategory,
    teamId: body.teamId,
  });

  const created = await ctx.db.query.categoryRoutes.findFirst({
    where: eq(categoryRoutes.id, id),
  });
  return ok(created, 201);
});
