import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  agents,
  agentProfiles,
  agentTeams,
  notificationEndpoints,
  notificationRequirements,
  productTeams,
  teams,
  users,
} from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { parseQuery, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";

const querySchema = z.object({ productId: z.string().min(1) });

export const GET = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const { productId } = parseQuery(req, querySchema);
    await assertProductAccess(ctx, productId);
    const associations = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(eq(productTeams.productId, productId));
    const teamIds = associations.map((row) => row.teamId);
    const teamRows = teamIds.length
      ? await ctx.db.select().from(teams).where(inArray(teams.id, teamIds))
      : [];
    const memberships = teamIds.length
      ? await ctx.db
          .select({ userId: agentTeams.userId, teamId: agentTeams.teamId })
          .from(agentTeams)
          .innerJoin(
            agents,
            and(eq(agents.userId, agentTeams.userId), eq(agents.active, true))
          )
          .where(inArray(agentTeams.teamId, teamIds))
      : [];
    const userIds = [...new Set(memberships.map((row) => row.userId))];
    const [userRows, profileRows, endpointRows, requirementRows] =
      await Promise.all([
        userIds.length
          ? ctx.db.select().from(users).where(inArray(users.id, userIds))
          : Promise.resolve([]),
        userIds.length
          ? ctx.db
              .select()
              .from(agentProfiles)
              .where(inArray(agentProfiles.userId, userIds))
          : Promise.resolve([]),
        userIds.length
          ? ctx.db
              .select()
              .from(notificationEndpoints)
              .where(
                and(
                  inArray(notificationEndpoints.userId, userIds),
                  eq(notificationEndpoints.enabled, true)
                )
              )
          : Promise.resolve([]),
        ctx.db
          .select()
          .from(notificationRequirements)
          .where(
            and(
              eq(notificationRequirements.productId, productId),
              eq(notificationRequirements.enabled, true)
            )
          ),
      ]);

    const userMap = new Map(userRows.map((row) => [row.id, row]));
    const profileMap = new Map(profileRows.map((row) => [row.userId, row]));
    const teamsByUser = new Map<string, string[]>();
    for (const membership of memberships) {
      const current = teamsByUser.get(membership.userId) ?? [];
      current.push(membership.teamId);
      teamsByUser.set(membership.userId, current);
    }
    const endpointTypesByUser = new Map<string, Set<string>>();
    for (const endpoint of endpointRows) {
      const current = endpointTypesByUser.get(endpoint.userId) ?? new Set();
      current.add(endpoint.channelType);
      endpointTypesByUser.set(endpoint.userId, current);
    }
    const agentViews = userIds.map((userId) => ({
      userId,
      displayName:
        profileMap.get(userId)?.displayName ||
        userMap.get(userId)?.displayName ||
        userId,
      email: profileMap.get(userId)?.email || userMap.get(userId)?.email || "",
      teamIds: teamsByUser.get(userId) ?? [],
      channelTypes: [...(endpointTypesByUser.get(userId) ?? new Set())],
    }));

    const requirements = requirementRows.map((row) => {
      const view = toNotificationRequirementView(row);
      const targets = agentViews.filter((agent) => {
        if (row.scopeType === "product") return true;
        if (row.scopeType === "team") {
          return Boolean(row.scopeTeamId && agent.teamIds.includes(row.scopeTeamId));
        }
        return agent.userId === row.scopeUserId;
      });
      const missing = targets
        .map((agent) => ({
          userId: agent.userId,
          displayName: agent.displayName,
          channelTypes: view.channelTypes.filter(
            (type) => !agent.channelTypes.includes(type)
          ),
        }))
        .filter((entry) => entry.channelTypes.length > 0);
      return { ...view, targetCount: targets.length, missing };
    });

    return ok({ teams: teamRows, agents: agentViews, requirements });
  }
);
