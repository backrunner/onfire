import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { users, agents, agentTeams, agentProfiles, teams } from "@/drizzle/schema";
import { ok, notFound, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";
import { canManageRole } from "@/lib/api-utils";
import { Role } from "@/lib/types";
import {
  STAFF_SCOPES,
  assertCanManageStaff,
  listScopedTeamIds,
  parseStaffScope,
} from "@/lib/staff-scope";

const listQuerySchema = z.object({
  teamId: z.string().optional(),
  active: z.string().optional(),
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

export const GET = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, listQuerySchema);
  const ref = await assertCanManageStaff(ctx, parseStaffScope(query));
  const activeOnly = query.active === "true";
  const scopedTeamIds = await listScopedTeamIds(ctx, ref);

  const userFilter =
    ref.scope === "system"
      ? undefined
      : ctx.isSuperAdmin && ref.tenantId
        ? eq(users.tenantId, ref.tenantId)
        : tenantCondition(ctx, users.tenantId);
  const tenantUsers = await ctx.db.select().from(users).where(userFilter);
  const userIds = tenantUsers.map((u) => u.id);
  if (userIds.length === 0) return ok([]);

  let agentList = await ctx.db
    .select()
    .from(agents)
    .where(inArray(agents.userId, userIds));
  if (activeOnly) {
    agentList = agentList.filter((a) => a.active);
  }
  if (agentList.length === 0) return ok([]);

  const agentUserIds = agentList.map((a) => a.userId);

  const allProfiles = await ctx.db
    .select()
    .from(agentProfiles)
    .where(inArray(agentProfiles.userId, agentUserIds));
  const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));

  const allTeamAssignments = await ctx.db
    .select()
    .from(agentTeams)
    .where(inArray(agentTeams.userId, agentUserIds));

  const teamAssignmentMap = new Map<string, string[]>();
  for (const ta of allTeamAssignments) {
    const existing = teamAssignmentMap.get(ta.userId) || [];
    existing.push(ta.teamId);
    teamAssignmentMap.set(ta.userId, existing);
  }

  const scopedMembers = new Set(
    allTeamAssignments
      .filter((ta) => scopedTeamIds.includes(ta.teamId))
      .map((ta) => ta.userId)
  );
  let filteredAgentList =
    ref.scope === "tenant"
      ? agentList
      : agentList.filter((a) => scopedMembers.has(a.userId));
  if (query.teamId) {
    if (!scopedTeamIds.includes(query.teamId)) {
      return ok([]);
    }
    const teamMemberIds = new Set(
      allTeamAssignments
        .filter((ta) => ta.teamId === query.teamId)
        .map((ta) => ta.userId)
    );
    filteredAgentList = filteredAgentList.filter((a) =>
      teamMemberIds.has(a.userId)
    );
  }

  const userMap = new Map(tenantUsers.map((u) => [u.id, u]));

  const enrichedAgents = filteredAgentList.map((agent) => {
    const user = userMap.get(agent.userId);
    const profile = profileMap.get(agent.userId);
    return {
      userId: agent.userId,
      level: agent.level,
      active: agent.active,
      displayName: profile?.displayName || user?.displayName,
      email: profile?.email || user?.email,
      avatarUrl: profile?.avatarUrl,
      teamIds: (teamAssignmentMap.get(agent.userId) || []).filter((id) =>
        scopedTeamIds.includes(id)
      ),
    };
  });

  return ok(enrichedAgents);
});

const createAgentSchema = z.object({
  userId: z.string().min(1),
  level: z.number().int().min(1).max(10).optional(),
  teamIds: z.array(z.string()).optional(),
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

export const POST = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createAgentSchema);
  const ref = await assertCanManageStaff(
    ctx,
    parseStaffScope({
      scope: body.scope,
      tenantId: body.tenantId,
      productId: body.productId,
    })
  );
  const scopedTeamIds = new Set(await listScopedTeamIds(ctx, ref));

  const user = await ctx.db.query.users.findFirst({ where: eq(users.id, body.userId) });
  if (
    !user ||
    (ref.scope !== "system" && ref.tenantId && user.tenantId !== ref.tenantId)
  ) {
    throw notFound("User not found");
  }
  if (!ctx.isSuperAdmin && !canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot manage an agent for an equal or higher role");
  }

  const existing = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, body.userId),
  });

  const teamIds = [...new Set(body.teamIds ?? [])];
  if (teamIds.some((id) => !scopedTeamIds.has(id))) {
    throw badRequest("Teams must belong to the current staff scope");
  }
  if (teamIds.length > 0) {
    const teamRows = await ctx.db
      .select({ id: teams.id, tenantId: teams.tenantId })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    if (teamRows.some((team) => team.tenantId && team.tenantId !== user.tenantId)) {
      throw forbidden("Agents can only join teams in their own tenant");
    }
  }

  if (existing) {
    if (teamIds.length === 0) throw badRequest("User is already an agent");
    const current = await ctx.db
      .select({ teamId: agentTeams.teamId })
      .from(agentTeams)
      .where(eq(agentTeams.userId, body.userId));
    const currentIds = new Set(current.map((row) => row.teamId));
    const added = teamIds.filter((id) => !currentIds.has(id));
    if (added.length > 0) {
      await ctx.db
        .insert(agentTeams)
        .values(added.map((teamId) => ({ userId: body.userId, teamId })));
    }
    return ok({ userId: body.userId, attached: true });
  }

  if (ctx.role === Role.ProductAdmin && body.level !== undefined) {
    throw forbidden("Product staff can only change product team memberships");
  }

  const insertAgent = ctx.db.insert(agents).values({
    userId: body.userId,
    level: ref.scope === "product" ? 1 : (body.level ?? 1),
    active: true,
  });

  if (teamIds.length > 0) {
    await ctx.db.batch([
      insertAgent,
      ctx.db
        .insert(agentTeams)
        .values(teamIds.map((teamId) => ({ userId: body.userId, teamId }))),
    ]);
  } else {
    await insertAgent;
  }

  return ok({ userId: body.userId, created: true }, 201);
});
