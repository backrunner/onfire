import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { teams } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { isTeamScoped, tenantCondition } from "@/lib/api/scope";

/**
 * GET /api/tob/meta/teams — teams visible to the current user, for filter
 * dropdowns and assignment pickers. Team-scoped roles only see their own
 * teams; admins see all teams of their tenant(s).
 */
export const GET = withAuth({ permission: "agent.profile" }, async (_req: NextRequest, ctx) => {
  if (isTeamScoped(ctx)) {
    if (ctx.teamIds.length === 0) return ok([]);
    const rows = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, ctx.teamIds));
    return ok(rows);
  }

  const rows = await ctx.db
    .select()
    .from(teams)
    .where(tenantCondition(ctx, teams.tenantId));
  return ok(rows);
});
