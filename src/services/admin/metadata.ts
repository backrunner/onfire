import { and, inArray } from "drizzle-orm";
import { products, productTeams, teams } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { isTeamScoped, tenantCondition, productScopeCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

export async function getTeams(ctx: AuthedContext) {
  if (ctx.delegatedResourceScope) {
    const visibleProducts = ctx.db.select({ id: products.id }).from(products).where(productScopeCondition(ctx));
    const visibleTeams = ctx.db.select({ id: productTeams.teamId }).from(productTeams).where(inArray(productTeams.productId, visibleProducts));
    return await ctx.db.select().from(teams).where(and(
      inArray(teams.id, visibleTeams),
      isTeamScoped(ctx) ? inArray(teams.id, ctx.teamIds) : undefined,
    ));
  }
  if (isTeamScoped(ctx)) {
    if (ctx.teamIds.length === 0) return [];
    const rows = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, ctx.teamIds));
    return rows;
  }

  if (ctx.role === Role.ProductAdmin) {
    if (ctx.productIds.length === 0) return [];
    const associations = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(inArray(productTeams.productId, ctx.productIds));
    const teamIds = [...new Set(associations.map((row) => row.teamId))];
    if (teamIds.length === 0) return [];
    const rows = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, teamIds));
    return rows;
  }

  const rows = await ctx.db
    .select()
    .from(teams)
    .where(tenantCondition(ctx, teams.tenantId));
  return rows;
}

export async function getProducts(ctx: AuthedContext) {
  return ctx.db.select().from(products).where(productScopeCondition(ctx));
}
