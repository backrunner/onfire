import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { agents, agentTeams, agentProfiles, users } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { assertTeamAccess } from "@/lib/api/scope";

const querySchema = z.object({
  teamId: z.string().min(1),
  active: z.string().optional(),
});

/**
 * GET /api/tob/meta/agents?teamId= — agents of a team, for assignment
 * pickers. Assignment-capable roles may inspect any visible team; Agents
 * can list their own teams only (needed for allowReassign reassignment).
 */
export const GET = withAuth({ permission: "ticket.read" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, querySchema);

  if (!query.teamId) throw badRequest("teamId is required");
  await assertTeamAccess(ctx, query.teamId);

  const memberRows = await ctx.db
    .select({ userId: agentTeams.userId })
    .from(agentTeams)
    .where(eq(agentTeams.teamId, query.teamId));
  const memberIds = memberRows.map((r) => r.userId);
  if (memberIds.length === 0) return ok([]);

  const conditions = [inArray(agents.userId, memberIds)];
  if (query.active === "true") conditions.push(eq(agents.active, true));

  const agentRows = await ctx.db
    .select()
    .from(agents)
    .where(and(...conditions));
  if (agentRows.length === 0) return ok([]);

  const ids = agentRows.map((a) => a.userId);
  const [profileRows, userRows] = await Promise.all([
    ctx.db.select().from(agentProfiles).where(inArray(agentProfiles.userId, ids)),
    ctx.db.select().from(users).where(inArray(users.id, ids)),
  ]);
  const profileMap = new Map(profileRows.map((p) => [p.userId, p]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return ok(
    agentRows.map((agent) => ({
      userId: agent.userId,
      level: agent.level,
      active: agent.active,
      displayName:
        profileMap.get(agent.userId)?.displayName ||
        userMap.get(agent.userId)?.displayName ||
        "",
      email:
        profileMap.get(agent.userId)?.email ||
        userMap.get(agent.userId)?.email ||
        "",
    }))
  );
});
