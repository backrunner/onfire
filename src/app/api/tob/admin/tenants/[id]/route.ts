import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { tenants } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, isSuperAdmin } from "@/lib/api-utils";

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

    // Only SuperAdmin can manage tenants
    if (!isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: tenant });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/tenants/[id]:", error);
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

    // Only SuperAdmin can manage tenants
    if (!isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const body = (await request.json()) as { name?: string; defaultTeamId?: string | null };

    await db
      .update(tenants)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.defaultTeamId !== undefined && { defaultTeamId: body.defaultTeamId }),
      })
      .where(eq(tenants.id, id));

    const updated = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/tenants/[id]:", error);
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

    // Only SuperAdmin can manage tenants
    if (!isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    await db.delete(tenants).where(eq(tenants.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/tenants/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
