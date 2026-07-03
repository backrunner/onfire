import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, agents, agentTeams } from "@/drizzle/schema";
import { ok, notFound, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { canManageRole } from "@/lib/api-utils";
import { Role } from "@/lib/types";

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(Role).optional(),
});

async function loadAccessibleUser(ctx: AuthedContext, id: string) {
  const user = await ctx.db.query.users.findFirst({ where: eq(users.id, id) });
  // 404 for cross-tenant access to avoid leaking user existence.
  if (!user || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(user.tenantId))) {
    throw notFound("User not found");
  }
  return user;
}

export const GET = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);

  const agent = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, user.id),
  });
  const teamRows = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .where(eq(agentTeams.userId, user.id));

  return ok({
    ...user,
    isAgent: !!agent,
    agentLevel: agent?.level,
    agentActive: agent?.active,
    teamIds: teamRows.map((r) => r.teamId),
  });
});

export const PATCH = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);
  const body = await parseBody(req, updateUserSchema);

  // Prevent privilege escalation when changing roles.
  if (body.role !== undefined) {
    if (!canManageRole(ctx.role, body.role)) {
      throw forbidden("Cannot assign equal or higher role");
    }
    if (!canManageRole(ctx.role, user.role)) {
      throw forbidden("Cannot modify user with equal or higher role");
    }
  }

  await ctx.db
    .update(users)
    .set({
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.role !== undefined && { role: body.role }),
    })
    .where(eq(users.id, user.id));

  const updated = await ctx.db.query.users.findFirst({ where: eq(users.id, user.id) });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);

  await ctx.db.batch([
    ctx.db.delete(agentTeams).where(eq(agentTeams.userId, user.id)),
    ctx.db.delete(agents).where(eq(agents.userId, user.id)),
    ctx.db.delete(users).where(eq(users.id, user.id)),
  ]);

  return ok({ deleted: true });
});
