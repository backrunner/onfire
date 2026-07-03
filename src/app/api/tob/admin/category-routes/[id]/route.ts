import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { categoryRoutes } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

const updateRouteSchema = z.object({
  category: z.string().min(1).optional(),
  subcategory: z.string().nullable().optional(),
  teamId: z.string().min(1).optional(),
});

async function loadAccessibleRoute(ctx: AuthedContext, id: string) {
  const route = await ctx.db.query.categoryRoutes.findFirst({
    where: eq(categoryRoutes.id, id),
  });
  if (!route) throw notFound("Route not found");
  await assertProductAccess(ctx, route.productId);
  return route;
}

export const GET = withAuth({ permission: "category.map" }, async (_req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  return ok(route);
});

export const PATCH = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  const body = await parseBody(req, updateRouteSchema);

  await ctx.db
    .update(categoryRoutes)
    .set({
      ...(body.category !== undefined && { category: body.category }),
      ...(body.subcategory !== undefined && { subcategory: body.subcategory }),
      ...(body.teamId !== undefined && { teamId: body.teamId }),
    })
    .where(eq(categoryRoutes.id, route.id));

  const updated = await ctx.db.query.categoryRoutes.findFirst({
    where: eq(categoryRoutes.id, route.id),
  });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "category.map" }, async (_req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  await ctx.db.delete(categoryRoutes).where(eq(categoryRoutes.id, route.id));
  return ok({ deleted: true });
});
