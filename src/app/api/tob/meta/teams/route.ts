import { NextRequest } from "next/server";
import { and, inArray } from "drizzle-orm";
import { products, productTeams, teams } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { isTeamScoped, tenantCondition, productScopeCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

/**
 * GET /api/tob/meta/teams — teams visible to the current user, for filter
 * dropdowns and assignment pickers. Team-scoped roles only see their own
 * teams; admins see all teams of their tenant(s).
 */
export const GET = withAuth({ permission: "agent.profile" }, async (_req: NextRequest, ctx) => {
  if (ctx.delegatedResourceScope) {
    const visibleProducts = ctx.db.select({ id: products.id }).from(products).where(productScopeCondition(ctx));
    const visibleTeams = ctx.db.select({ id: productTeams.teamId }).from(productTeams).where(inArray(productTeams.productId, visibleProducts));
    return ok(await ctx.db.select().from(teams).where(and(
      inArray(teams.id, visibleTeams),
      isTeamScoped(ctx) ? inArray(teams.id, ctx.teamIds) : undefined,
    )));
  }
  if (isTeamScoped(ctx)) {
    if (ctx.teamIds.length === 0) return ok([]);
    const rows = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, ctx.teamIds));
    return ok(rows);
  }

  if (ctx.role === Role.ProductAdmin) {
    if (ctx.productIds.length === 0) return ok([]);
    const associations = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(inArray(productTeams.productId, ctx.productIds));
    const teamIds = [...new Set(associations.map((row) => row.teamId))];
    if (teamIds.length === 0) return ok([]);
    const rows = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, teamIds));
    return ok(rows);
  }

  const rows = await ctx.db
    .select()
    .from(teams)
    .where(tenantCondition(ctx, teams.tenantId));
  return ok(rows);
});
