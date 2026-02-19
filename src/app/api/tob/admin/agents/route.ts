import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, agents, agentTeams, agentProfiles, teams } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";
import { resolveUserContext } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!hasPermission(ctx.user.role as Role, "user.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const activeOnly = searchParams.get("active") === "true";

    // Get all users in tenant
    const tenantUsers = await db
      .select()
      .from(users)
      .where(inArray(users.tenantId, ctx.tenantIds));
    const userIds = tenantUsers.map((u) => u.id);

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    // Get all agents in a single query
    let agentList = await db
      .select()
      .from(agents)
      .where(inArray(agents.userId, userIds));

    if (activeOnly) {
      agentList = agentList.filter((a) => a.active);
    }

    if (agentList.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const agentUserIds = agentList.map((a) => a.userId);

    // Batch fetch all profiles in a single query
    const allProfiles = await db
      .select()
      .from(agentProfiles)
      .where(inArray(agentProfiles.userId, agentUserIds));
    const profileMap = new Map(allProfiles.map((p) => [p.userId, p]));

    // Batch fetch all team assignments in a single query
    const allTeamAssignments = await db
      .select()
      .from(agentTeams)
      .where(inArray(agentTeams.userId, agentUserIds));

    // Group team assignments by userId
    const teamAssignmentMap = new Map<string, string[]>();
    for (const ta of allTeamAssignments) {
      const existing = teamAssignmentMap.get(ta.userId) || [];
      existing.push(ta.teamId);
      teamAssignmentMap.set(ta.userId, existing);
    }

    // Filter by team if specified
    let filteredAgentList = agentList;
    if (teamId) {
      const teamMemberIds = new Set(
        allTeamAssignments.filter((ta) => ta.teamId === teamId).map((ta) => ta.userId)
      );
      filteredAgentList = agentList.filter((a) => teamMemberIds.has(a.userId));
    }

    // Build user lookup map
    const userMap = new Map(tenantUsers.map((u) => [u.id, u]));

    // Enrich agents with profile and team data (no additional queries)
    const enrichedAgents = filteredAgentList.map((agent) => {
      const user = userMap.get(agent.userId);
      const profile = profileMap.get(agent.userId);
      const teamIds = teamAssignmentMap.get(agent.userId) || [];

      return {
        userId: agent.userId,
        level: agent.level,
        active: agent.active,
        displayName: profile?.displayName || user?.displayName,
        email: profile?.email || user?.email,
        avatarUrl: profile?.avatarUrl,
        teamIds,
      };
    });

    return NextResponse.json({ ok: true, data: enrichedAgents });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/agents:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!hasPermission(ctx.user.role as Role, "user.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      userId: string;
      level?: number;
      teamIds?: string[];
    };

    if (!body.userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // Verify user exists and is in tenant
    const user = await db.query.users.findFirst({ where: eq(users.id, body.userId) });

    if (!user || !ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Check if already an agent
    const existing = await db.query.agents.findFirst({
      where: eq(agents.userId, body.userId),
    });

    if (existing) {
      return NextResponse.json({ ok: false, error: "User is already an agent" }, { status: 400 });
    }

    // Verify teams belong to accessible tenants
    if (body.teamIds && body.teamIds.length > 0) {
      const validTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(inArray(teams.id, body.teamIds));

      const validTeamIds = new Set(validTeams.map((t) => t.id));
      const invalidTeamIds = body.teamIds.filter((id) => !validTeamIds.has(id));

      if (invalidTeamIds.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Invalid team IDs: " + invalidTeamIds.join(", ") },
          { status: 400 }
        );
      }

      // Verify teams belong to user's accessible tenants
      const accessibleTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(inArray(teams.tenantId, ctx.tenantIds));

      const accessibleTeamIds = new Set(accessibleTeams.map((t) => t.id));
      const forbiddenTeamIds = body.teamIds.filter((id) => !accessibleTeamIds.has(id));

      if (forbiddenTeamIds.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot assign to teams outside your tenant" },
          { status: 403 }
        );
      }
    }

    // Create agent
    await db.insert(agents).values({
      userId: body.userId,
      level: body.level ?? 1,
      active: true,
    });

    // Add to teams
    if (body.teamIds && body.teamIds.length > 0) {
      await db.insert(agentTeams).values(
        body.teamIds.map((teamId) => ({ userId: body.userId, teamId }))
      );
    }

    return NextResponse.json(
      { ok: true, data: { userId: body.userId, created: true } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/tob/admin/agents:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
