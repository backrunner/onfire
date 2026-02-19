import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, agents, agentTeams } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";
import { resolveUserContext, canManageRole } from "@/lib/api-utils";

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

    const userList = await db
      .select()
      .from(users)
      .where(inArray(users.tenantId, ctx.tenantIds));

    // Get agent info for each user
    const enrichedUsers = await Promise.all(
      userList.map(async (u) => {
        const agent = await db.query.agents.findFirst({
          where: eq(agents.userId, u.id),
        });
        const teamRows = await db
          .select({ teamId: agentTeams.teamId })
          .from(agentTeams)
          .where(eq(agentTeams.userId, u.id));
        return {
          ...u,
          isAgent: !!agent,
          agentLevel: agent?.level,
          agentActive: agent?.active,
          teamIds: teamRows.map((r) => r.teamId),
        };
      })
    );

    return NextResponse.json({ ok: true, data: enrichedUsers });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/users:", error);
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
      email: string;
      displayName: string;
      role: Role;
      tenantId?: string;
    };

    if (!body.email || !body.displayName || !body.role) {
      return NextResponse.json(
        { ok: false, error: "email, displayName, and role are required" },
        { status: 400 }
      );
    }

    const tenantId = body.tenantId || ctx.tenantIds[0];

    if (!ctx.tenantIds.includes(tenantId)) {
      return NextResponse.json({ ok: false, error: "Invalid tenantId" }, { status: 400 });
    }

    // Prevent privilege escalation: users can only create users with lower roles
    if (!canManageRole(ctx.user.role as Role, body.role)) {
      return NextResponse.json(
        { ok: false, error: "Cannot create user with equal or higher role" },
        { status: 403 }
      );
    }

    // Check if email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });

    if (existing) {
      return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      tenantId,
    });

    const created = await db.query.users.findFirst({ where: eq(users.id, id) });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/users:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
