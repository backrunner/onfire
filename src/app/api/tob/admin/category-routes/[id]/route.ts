import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { categoryRoutes, productTeams } from "@/drizzle/schema";
import { ok, notFound, badRequest, forbidden, conflict } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const updateRouteSchema = z.object({
  category: z.string().trim().min(1).max(200).optional(),
  subcategory: z.string().trim().max(200).nullable().optional(),
  teamId: z.string().min(1).optional(),
});

async function assertUniqueRoute(
  ctx: AuthedContext,
  productId: string,
  category: string,
  subcategory: string,
  excludeId: string
) {
  const rows = await ctx.db
    .select({ id: categoryRoutes.id })
    .from(categoryRoutes)
    .where(
      and(
        eq(categoryRoutes.productId, productId),
        eq(categoryRoutes.category, category),
        subcategory
          ? eq(categoryRoutes.subcategory, subcategory)
          : or(
              eq(categoryRoutes.subcategory, ""),
              isNull(categoryRoutes.subcategory)
            )
      )
    )
    .limit(2);
  if (rows.some((row) => row.id !== excludeId)) {
    throw conflict("A route for this category already exists");
  }
}

async function loadAccessibleRoute(ctx: AuthedContext, id: string) {
  const route = await ctx.db.query.categoryRoutes.findFirst({
    where: eq(categoryRoutes.id, id),
  });
  if (!route) throw notFound("Route not found");
  await assertProductAccess(ctx, route.productId);
  if (ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(route.teamId)) {
    throw notFound("Route not found");
  }
  return route;
}

export const GET = withAuth({ permission: "category.map" }, async (_req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  return ok(route);
});

export const PATCH = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  const body = await parseBody(req, updateRouteSchema);

  const nextCategory = body.category?.trim() ?? route.category;
  const nextSubcategory =
    body.subcategory !== undefined
      ? body.subcategory?.trim() || ""
      : route.subcategory ?? "";
  if (
    nextCategory !== route.category ||
    nextSubcategory !== (route.subcategory ?? "")
  ) {
    await assertUniqueRoute(
      ctx,
      route.productId,
      nextCategory,
      nextSubcategory,
      route.id
    );
  }

  if (body.teamId !== undefined) {
    const association = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(
        and(
          eq(productTeams.productId, route.productId),
          eq(productTeams.teamId, body.teamId)
        )
      )
      .get();
    if (!association) throw badRequest("Team is not attached to this product");
    if (ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(body.teamId)) {
      throw forbidden("TeamAdmin can only map categories to their own teams");
    }
  }

  try {
    await ctx.db
      .update(categoryRoutes)
      .set({
        ...(body.category !== undefined && { category: nextCategory }),
        ...(body.subcategory !== undefined && { subcategory: nextSubcategory }),
        ...(body.teamId !== undefined && { teamId: body.teamId }),
      })
      .where(eq(categoryRoutes.id, route.id));
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw conflict("A route for this category already exists");
    }
    throw error;
  }

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
