import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { rolePermissions } from "@/lib/types";
import { users, agents, agentTeams, productTeams, products } from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getDb();

    // Get user profile from users table
    const userProfile = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!userProfile) {
      return NextResponse.json(
        { ok: false, error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get agent info if exists
    const agent = await db.query.agents.findFirst({
      where: eq(agents.userId, session.user.id),
    });

    // Get team IDs for the user
    const agentTeamRows = await db
      .select()
      .from(agentTeams)
      .where(eq(agentTeams.userId, session.user.id));
    const teamIds = agentTeamRows.map((at) => at.teamId);

    // Get product IDs based on teams
    let productIds: string[] = [];
    if (teamIds.length > 0) {
      const productTeamRows = await db
        .select()
        .from(productTeams)
        .where(inArray(productTeams.teamId, teamIds));
      productIds = [...new Set(productTeamRows.map((pt) => pt.productId))];
    }

    // Get tenant IDs
    const tenantIds = [userProfile.tenantId];

    return NextResponse.json({
      ok: true,
      data: {
        user: userProfile,
        role: userProfile.role,
        permissions: rolePermissions[userProfile.role] ?? [],
        tenantIds,
        productIds,
        teamIds,
        agent: agent
          ? {
              userId: agent.userId,
              level: agent.level,
              active: agent.active,
              teamIds,
            }
          : undefined,
      },
    });
  } catch (error) {
    console.error("Error in /api/tob/me:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
