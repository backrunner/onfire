import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { categoryRoutes } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { Role } from "@/lib/types";

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

export const GET = withAuth({ permission: "ticket_type.route" }, async (_req: NextRequest, ctx) => {
  const route = await loadAccessibleRoute(ctx, ctx.params.id);
  return ok(route);
});
