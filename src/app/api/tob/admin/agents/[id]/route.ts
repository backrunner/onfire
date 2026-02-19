import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, agents, agentTeams, agentProfiles, teams } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";
import { resolveUserContext } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const agent = await db.query.agents.findFirst({ where: eq(agents.userId, id) });

    if (!agent) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user || !ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const profile = await db.query.agentProfiles.findFirst({
      where: eq(agentProfiles.userId, id),
    });

    const teamRows = await db
      .select({ teamId: agentTeams.teamId })
      .from(agentTeams)
      .where(eq(agentTeams.userId, id));

    return NextResponse.json({
      ok: true,
      data: {
        userId: agent.userId,
        level: agent.level,
        active: agent.active,
        displayName: profile?.displayName || user.displayName,
        email: profile?.email || user.email,
        avatarUrl: profile?.avatarUrl,
        teamIds: teamRows.map((r) => r.teamId),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/agents/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const agent = await db.query.agents.findFirst({ where: eq(agents.userId, id) });

    if (!agent) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user || !ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      level?: number;
      active?: boolean;
      displayName?: string;
      email?: string;
      avatarUrl?: string | null;
      teamIds?: string[];
    };

    // Update agent
    await db
      .update(agents)
      .set({
        ...(body.level !== undefined && { level: body.level }),
        ...(body.active !== undefined && { active: body.active }),
      })
      .where(eq(agents.userId, id));

    // Update or create agent profile
    if (body.displayName !== undefined || body.email !== undefined || body.avatarUrl !== undefined) {
      const existingProfile = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.userId, id),
      });

      if (existingProfile) {
        await db
          .update(agentProfiles)
          .set({
            ...(body.displayName !== undefined && { displayName: body.displayName }),
            ...(body.email !== undefined && { email: body.email }),
            ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
          })
          .where(eq(agentProfiles.userId, id));
      } else {
        await db.insert(agentProfiles).values({
          userId: id,
          displayName: body.displayName || user.displayName,
          email: body.email || user.email,
          avatarUrl: body.avatarUrl,
        });
      }
    }

    // Update team memberships
    if (body.teamIds !== undefined) {
      // Verify teams belong to accessible tenants
      if (body.teamIds.length > 0) {
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

      await db.delete(agentTeams).where(eq(agentTeams.userId, id));
      if (body.teamIds.length > 0) {
        await db.insert(agentTeams).values(
          body.teamIds.map((teamId) => ({ userId: id, teamId }))
        );
      }
    }

    return NextResponse.json({ ok: true, data: { updated: true } });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/agents/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const agent = await db.query.agents.findFirst({ where: eq(agents.userId, id) });

    if (!agent) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user || !ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Delete agent records (keep user)
    await db.delete(agentTeams).where(eq(agentTeams.userId, id));
    await db.delete(agentProfiles).where(eq(agentProfiles.userId, id));
    await db.delete(agents).where(eq(agents.userId, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/agents/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
