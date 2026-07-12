import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { users, agents, agentTeams, agentProfiles, teams } from "@/drizzle/schema";
import { ok, notFound, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";
import { canManageRole } from "@/lib/api-utils";

const listQuerySchema = z.object({
  teamId: z.string().optional(),
  active: z.string().optional(),
});

const createAgentSchema = z.object({
  userId: z.string().min(1),
  level: z.number().int().min(1).max(10).optional(),
  teamIds: z.array(z.string()).optional(),
});

export const GET = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, listQuerySchema);
  const activeOnly = query.active === "true";

  const tenantUsers = await ctx.db
    .select()
    .from(users)
    .where(tenantCondition(ctx, users.tenantId));
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

  let filteredAgentList = agentList;
  if (query.teamId) {
    const teamMemberIds = new Set(
      allTeamAssignments
        .filter((ta) => ta.teamId === query.teamId)
        .map((ta) => ta.userId)
    );
    filteredAgentList = agentList.filter((a) => teamMemberIds.has(a.userId));
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
      teamIds: teamAssignmentMap.get(agent.userId) || [],
    };
  });

  return ok(enrichedAgents);
});

export const POST = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createAgentSchema);

  const user = await ctx.db.query.users.findFirst({ where: eq(users.id, body.userId) });
  if (!user || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(user.tenantId))) {
    throw notFound("User not found");
  }
  if (!canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot manage an agent for an equal or higher role");
  }

  const existing = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, body.userId),
  });
  if (existing) throw badRequest("User is already an agent");

  const teamIds = [...new Set(body.teamIds ?? [])];
  if (teamIds.length > 0) {
    const teamRows = await ctx.db
      .select({ id: teams.id, tenantId: teams.tenantId })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    const foundTeamIds = new Set(teamRows.map((t) => t.id));

    const invalidTeamIds = teamIds.filter((id) => !foundTeamIds.has(id));
    if (invalidTeamIds.length > 0) {
      throw badRequest("Invalid team IDs: " + invalidTeamIds.join(", "));
    }
    if (teamRows.some((team) => team.tenantId !== user.tenantId)) {
      throw forbidden("Agents can only join teams in their own tenant");
    }
  }

  const insertAgent = ctx.db.insert(agents).values({
    userId: body.userId,
    level: body.level ?? 1,
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
