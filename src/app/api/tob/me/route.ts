import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { agents } from "@/drizzle/schema";
import { rolePermissions } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";

export const GET = withAuth({}, async (_req: NextRequest, ctx) => {
  const agent = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, ctx.user.id),
  });

  return ok({
    user: ctx.user,
    role: ctx.role,
    permissions: rolePermissions[ctx.role] ?? [],
    // Keep legacy shape: the user's own tenant (even for SuperAdmin, whose
    // ctx.tenantIds is empty to signal unrestricted access).
    tenantIds: [ctx.user.tenantId],
    productIds: ctx.productIds,
    teamIds: ctx.teamIds,
    agent: agent
      ? {
          userId: agent.userId,
          level: agent.level,
          active: agent.active,
          teamIds: ctx.teamIds,
        }
      : undefined,
  });
});
