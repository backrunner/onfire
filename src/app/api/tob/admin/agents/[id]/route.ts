import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  users,
  agents,
  agentTeams,
  agentProfiles,
  notificationRequirements,
  notificationRules,
  teams,
  tickets,
} from "@/drizzle/schema";
import { ok, notFound, forbidden, conflict } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { canManageRole } from "@/lib/api-utils";

const updateAgentSchema = z.object({
  level: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(320).optional(),
  avatarUrl: z.string().url().max(2_048).nullable().optional(),
  teamIds: z.array(z.string()).optional(),
});

async function loadAccessibleAgent(ctx: AuthedContext, id: string) {
  const agent = await ctx.db.query.agents.findFirst({ where: eq(agents.userId, id) });
  if (!agent) throw notFound("Agent not found");

  const user = await ctx.db.query.users.findFirst({ where: eq(users.id, id) });
  // 404 for cross-tenant access to avoid leaking agent existence.
  if (!user || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(user.tenantId))) {
    throw notFound("Agent not found");
  }
  return { agent, user };
}

export const GET = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);

  const profile = await ctx.db.query.agentProfiles.findFirst({
    where: eq(agentProfiles.userId, agent.userId),
  });
  const teamRows = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .where(eq(agentTeams.userId, agent.userId));

  return ok({
    userId: agent.userId,
    level: agent.level,
    active: agent.active,
    displayName: profile?.displayName || user.displayName,
    email: profile?.email || user.email,
    avatarUrl: profile?.avatarUrl,
    teamIds: teamRows.map((r) => r.teamId),
  });
});

export const PATCH = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);
  const body = await parseBody(req, updateAgentSchema);

  if (!canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot manage an agent for an equal or higher role");
  }

  if (body.teamIds && body.teamIds.length > 0) {
    const teamIds = [...new Set(body.teamIds)];
    const accessibleTeams = await ctx.db
      .select({ id: teams.id, tenantId: teams.tenantId })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    const accessibleTeamIds = new Set(accessibleTeams.map((t) => t.id));
    if (
      teamIds.some((teamId) => !accessibleTeamIds.has(teamId)) ||
      accessibleTeams.some((team) => team.tenantId !== user.tenantId)
    ) {
      throw forbidden("Agents can only join teams in their own tenant");
    }
  }

  const statements: BatchItem<"sqlite">[] = [];

  const agentFields = {
    ...(body.level !== undefined && { level: body.level }),
    ...(body.active !== undefined && { active: body.active }),
  };
  if (Object.keys(agentFields).length > 0) {
    statements.push(
      ctx.db.update(agents).set(agentFields).where(eq(agents.userId, agent.userId))
    );
  }

  if (
    body.displayName !== undefined ||
    body.email !== undefined ||
    body.avatarUrl !== undefined
  ) {
    const existingProfile = await ctx.db.query.agentProfiles.findFirst({
      where: eq(agentProfiles.userId, agent.userId),
    });
    if (existingProfile) {
      statements.push(
        ctx.db
          .update(agentProfiles)
          .set({
            ...(body.displayName !== undefined && { displayName: body.displayName }),
            ...(body.email !== undefined && { email: body.email }),
            ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
          })
          .where(eq(agentProfiles.userId, agent.userId))
      );
    } else {
      statements.push(
        ctx.db.insert(agentProfiles).values({
          userId: agent.userId,
          displayName: body.displayName || user.displayName,
          email: body.email || user.email,
          avatarUrl: body.avatarUrl,
        })
      );
    }
  }

  if (body.teamIds !== undefined) {
    const teamIds = [...new Set(body.teamIds)];
    statements.push(
      ctx.db.delete(agentTeams).where(eq(agentTeams.userId, agent.userId))
    );
    if (teamIds.length > 0) {
      statements.push(
        ctx.db
          .insert(agentTeams)
          .values(teamIds.map((teamId) => ({ userId: agent.userId, teamId })))
      );
    }
  }

  if (statements.length > 0) {
    await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  return ok({ updated: true });
});

export const DELETE = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);
  if (!canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot manage an agent for an equal or higher role");
  }

  const [assignedTicket] = await ctx.db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.assigneeId, agent.userId))
    .limit(1);
  if (assignedTicket) {
    throw conflict("Reassign this agent's tickets before removing the agent role");
  }

  const notificationReferences = await Promise.all([
    ctx.db.query.notificationRules.findFirst({
      where: eq(notificationRules.recipientUserId, agent.userId),
    }),
    ctx.db.query.notificationRequirements.findFirst({
      where: eq(notificationRequirements.scopeUserId, agent.userId),
    }),
  ]);
  if (notificationReferences.some(Boolean)) {
    throw conflict("Remove notification rules and requirements for this agent first");
  }

  // Delete agent records (keep the user account).
  await ctx.db.batch([
    ctx.db.delete(agentTeams).where(eq(agentTeams.userId, agent.userId)),
    ctx.db.delete(agentProfiles).where(eq(agentProfiles.userId, agent.userId)),
    ctx.db.delete(agents).where(eq(agents.userId, agent.userId)),
  ]);

  return ok({ deleted: true });
});
