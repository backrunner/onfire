import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
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
import { withAuth, parseBody, parseQuery, type AuthedContext } from "@/lib/api/handler";
import { canManageRole } from "@/lib/api-utils";
import { Role } from "@/lib/types";
import {
  STAFF_SCOPES,
  assertCanManageStaff,
  listScopedTeamIds,
  parseStaffScope,
} from "@/lib/staff-scope";

const updateAgentSchema = z.object({
  level: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(320).optional(),
  avatarUrl: z.string().url().max(2_048).nullable().optional(),
  teamIds: z.array(z.string()).optional(),
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

const staffQuerySchema = z.object({
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
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

export const GET = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const ref = await assertCanManageStaff(ctx, parseStaffScope(parseQuery(req, staffQuerySchema)));
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);
  const scopedTeamIds = new Set(await listScopedTeamIds(ctx, ref));

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
    teamIds: teamRows.map((r) => r.teamId).filter((id) => scopedTeamIds.has(id)),
  });
});

export const PATCH = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, updateAgentSchema);
  const ref = await assertCanManageStaff(
    ctx,
    parseStaffScope({
      scope: body.scope,
      tenantId: body.tenantId,
      productId: body.productId,
    })
  );
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);
  const scopedTeamIds = new Set(await listScopedTeamIds(ctx, ref));

  if (!ctx.isSuperAdmin && !canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot manage an agent for an equal or higher role");
  }
  if (
    ctx.role === Role.ProductAdmin &&
    (body.level !== undefined ||
      body.active !== undefined ||
      body.displayName !== undefined ||
      body.email !== undefined ||
      body.avatarUrl !== undefined)
  ) {
    throw forbidden("Product staff can only change product team memberships");
  }

  if (body.teamIds && body.teamIds.some((id) => !scopedTeamIds.has(id))) {
    throw forbidden("Teams must belong to the current staff scope");
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
    const current = await ctx.db
      .select({ teamId: agentTeams.teamId })
      .from(agentTeams)
      .where(eq(agentTeams.userId, agent.userId));
    const kept = current
      .map((row) => row.teamId)
      .filter((id) => !scopedTeamIds.has(id));
    const teamIds = [...new Set([...kept, ...body.teamIds])];
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

export const DELETE = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const ref = await assertCanManageStaff(ctx, parseStaffScope(parseQuery(req, staffQuerySchema)));
  const { agent, user } = await loadAccessibleAgent(ctx, ctx.params.id);
  if (ref.scope === "product") {
    const scopedTeamIds = await listScopedTeamIds(ctx, ref);
    if (scopedTeamIds.length > 0) {
      await ctx.db
        .delete(agentTeams)
        .where(
          and(eq(agentTeams.userId, agent.userId), inArray(agentTeams.teamId, scopedTeamIds))
        );
    }
    return ok({ detached: true });
  }
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
