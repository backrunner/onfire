import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { tenants, users } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, isSuperAdmin } from "@/lib/api-utils";

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

    // Only SuperAdmin can manage tenants
    if (!isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenantList = await db.select().from(tenants);

    return NextResponse.json({ ok: true, data: tenantList });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/tenants:", error);
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

    // Only SuperAdmin can manage tenants
    if (!isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { name: string; defaultTeamId?: string };

    if (!body.name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(tenants).values({
      id,
      name: body.name,
      defaultTeamId: body.defaultTeamId,
    });

    const created = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/tenants:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
