import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { teams, agentTeams, productTeams } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq } from "drizzle-orm";
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

    if (!hasPermission(ctx.user.role as Role, "team.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const team = await db.query.teams.findFirst({ where: eq(teams.id, id) });

    if (!team) {
      return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(team.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Get team members
    const memberRows = await db
      .select({ userId: agentTeams.userId })
      .from(agentTeams)
      .where(eq(agentTeams.teamId, id));

    // Get associated products
    const productRows = await db
      .select({ productId: productTeams.productId })
      .from(productTeams)
      .where(eq(productTeams.teamId, id));

    return NextResponse.json({
      ok: true,
      data: {
        ...team,
        memberIds: memberRows.map((r) => r.userId),
        productIds: productRows.map((r) => r.productId),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/teams/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "team.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const team = await db.query.teams.findFirst({ where: eq(teams.id, id) });

    if (!team) {
      return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(team.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      allowReassign?: boolean;
      memberIds?: string[];
    };

    await db
      .update(teams)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.allowReassign !== undefined && { allowReassign: body.allowReassign }),
      })
      .where(eq(teams.id, id));

    // Update team members if provided
    if (body.memberIds !== undefined) {
      await db.delete(agentTeams).where(eq(agentTeams.teamId, id));
      if (body.memberIds.length > 0) {
        await db.insert(agentTeams).values(
          body.memberIds.map((userId) => ({ userId, teamId: id }))
        );
      }
    }

    const updated = await db.query.teams.findFirst({ where: eq(teams.id, id) });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/teams/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "team.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const team = await db.query.teams.findFirst({ where: eq(teams.id, id) });

    if (!team) {
      return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(team.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Delete associated records
    await db.delete(agentTeams).where(eq(agentTeams.teamId, id));
    await db.delete(productTeams).where(eq(productTeams.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/teams/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
