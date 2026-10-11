import { eq } from "drizzle-orm";
import { agents, users } from "@/drizzle/schema";
import { Role, rolePermissions } from "@/lib/types";
import type { AuthedContext } from "@/lib/api/handler";
import type { MeResponse } from "@/lib/api/types";

export async function getMe(ctx: AuthedContext): Promise<MeResponse> {
  const agent = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, ctx.user.id),
  });

  let preview = null;
  if (ctx.preview) {
    const actor = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.preview.actorId),
    });
    if (actor) {
      preview = {
        actor: {
          id: actor.id,
          displayName: actor.displayName,
          email: actor.email,
          role: actor.role as Role,
        },
        target: {
          id: ctx.user.id,
          displayName: ctx.user.displayName,
          email: ctx.user.email,
          role: ctx.role,
        },
      };
    }
  }

  return {
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
    preview,
  };
}
