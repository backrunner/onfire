import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { categoryRoutes, productTeams, products } from "@/drizzle/schema";
import { ok, badRequest, forbidden, conflict } from "@/lib/api/response";
import {
  withAuth,
  parseBody,
  parseQuery,
  type AuthedContext,
} from "@/lib/api/handler";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const listQuerySchema = z.object({
  productId: z.string().optional(),
});

const createRouteSchema = z.object({
  productId: z.string().min(1),
  category: z.string().trim().min(1).max(200),
  subcategory: z.string().trim().max(200).optional(),
  teamId: z.string().min(1),
});

async function assertUniqueRoute(
  ctx: AuthedContext,
  input: { productId: string; category: string; subcategory?: string | null },
  excludeId?: string
) {
  const rows = await ctx.db
    .select({ id: categoryRoutes.id })
    .from(categoryRoutes)
    .where(
      and(
        eq(categoryRoutes.productId, input.productId),
        eq(categoryRoutes.category, input.category),
        input.subcategory
          ? eq(categoryRoutes.subcategory, input.subcategory)
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

async function assertRouteTeam(
  ctx: AuthedContext,
  productId: string,
  teamId: string
) {
  const association = await ctx.db
    .select({ teamId: productTeams.teamId })
    .from(productTeams)
    .where(
      and(
        eq(productTeams.productId, productId),
        eq(productTeams.teamId, teamId)
      )
    )
    .get();
  if (!association) throw badRequest("Team is not attached to this product");
  if (ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(teamId)) {
    throw forbidden("TeamAdmin can only map categories to their own teams");
  }
}

export const GET = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
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

export const POST = withAuth({ permission: "category.map" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createRouteSchema);
  await assertProductAccess(ctx, body.productId);
  await assertRouteTeam(ctx, body.productId, body.teamId);
  const subcategory = body.subcategory?.trim() || "";
  await assertUniqueRoute(ctx, {
    productId: body.productId,
    category: body.category.trim(),
    subcategory,
  });

  const id = crypto.randomUUID();

  try {
    await ctx.db.insert(categoryRoutes).values({
      id,
      productId: body.productId,
      category: body.category.trim(),
      subcategory,
      teamId: body.teamId,
    });
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw conflict("A route for this category already exists");
    }
    throw error;
  }

  const created = await ctx.db.query.categoryRoutes.findFirst({
    where: eq(categoryRoutes.id, id),
  });
  return ok(created, 201);
});
