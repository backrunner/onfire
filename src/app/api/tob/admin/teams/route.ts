import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { teams } from "@/drizzle/schema";
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

    if (!hasPermission(ctx.user.role as Role, "team.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const teamList = await db
      .select()
      .from(teams)
      .where(inArray(teams.tenantId, ctx.tenantIds));

    return NextResponse.json({ ok: true, data: teamList });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/teams:", error);
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

    if (!hasPermission(ctx.user.role as Role, "team.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name: string;
      tenantId?: string;
      allowReassign?: boolean;
    };

    if (!body.name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const tenantId = body.tenantId || ctx.tenantIds[0];

    if (!ctx.tenantIds.includes(tenantId)) {
      return NextResponse.json({ ok: false, error: "Invalid tenantId" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(teams).values({
      id,
      tenantId,
      name: body.name,
      allowReassign: body.allowReassign ?? true,
    });

    const created = await db.query.teams.findFirst({ where: eq(teams.id, id) });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/teams:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
