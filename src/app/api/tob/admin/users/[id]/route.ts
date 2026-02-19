import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, agents, agentTeams } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, canManageRole } from "@/lib/api-utils";

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

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const agent = await db.query.agents.findFirst({ where: eq(agents.userId, id) });
    const teamRows = await db
      .select({ teamId: agentTeams.teamId })
      .from(agentTeams)
      .where(eq(agentTeams.userId, id));

    return NextResponse.json({
      ok: true,
      data: {
        ...user,
        isAgent: !!agent,
        agentLevel: agent?.level,
        agentActive: agent?.active,
        teamIds: teamRows.map((r) => r.teamId),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/users/[id]:", error);
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

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      displayName?: string;
      role?: Role;
    };

    // Prevent privilege escalation when changing roles
    if (body.role !== undefined) {
      // Cannot change to a role equal or higher than your own
      if (!canManageRole(ctx.user.role as Role, body.role)) {
        return NextResponse.json(
          { ok: false, error: "Cannot assign equal or higher role" },
          { status: 403 }
        );
      }
      // Cannot modify users with equal or higher roles
      if (!canManageRole(ctx.user.role as Role, user.role as Role)) {
        return NextResponse.json(
          { ok: false, error: "Cannot modify user with equal or higher role" },
          { status: 403 }
        );
      }
    }

    await db
      .update(users)
      .set({
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.role !== undefined && { role: body.role }),
      })
      .where(eq(users.id, id));

    const updated = await db.query.users.findFirst({ where: eq(users.id, id) });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/users/[id]:", error);
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

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(user.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Delete associated records
    await db.delete(agentTeams).where(eq(agentTeams.userId, id));
    await db.delete(agents).where(eq(agents.userId, id));
    await db.delete(users).where(eq(users.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/users/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
