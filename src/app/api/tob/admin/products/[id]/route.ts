import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { products, productTeams, teams } from "@/drizzle/schema";
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const product = await db.query.products.findFirst({ where: eq(products.id, id) });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Get associated teams
    const teamRows = await db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(eq(productTeams.productId, id));

    return NextResponse.json({
      ok: true,
      data: { ...product, teamIds: teamRows.map((r) => r.teamId) },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/products/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const product = await db.query.products.findFirst({ where: eq(products.id, id) });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      slaHighAccept?: number | null;
      slaHighReply?: number | null;
      slaMediumAccept?: number | null;
      slaMediumReply?: number | null;
      slaLowAccept?: number | null;
      slaLowReply?: number | null;
      autoCloseMinutes?: number | null;
      teamIds?: string[];
    };

    await db
      .update(products)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.slaHighAccept !== undefined && { slaHighAccept: body.slaHighAccept }),
        ...(body.slaHighReply !== undefined && { slaHighReply: body.slaHighReply }),
        ...(body.slaMediumAccept !== undefined && { slaMediumAccept: body.slaMediumAccept }),
        ...(body.slaMediumReply !== undefined && { slaMediumReply: body.slaMediumReply }),
        ...(body.slaLowAccept !== undefined && { slaLowAccept: body.slaLowAccept }),
        ...(body.slaLowReply !== undefined && { slaLowReply: body.slaLowReply }),
        ...(body.autoCloseMinutes !== undefined && { autoCloseMinutes: body.autoCloseMinutes }),
      })
      .where(eq(products.id, id));

    // Update team associations if provided
    if (body.teamIds !== undefined) {
      // Verify teams belong to accessible tenants
      if (body.teamIds.length > 0) {
        const accessibleTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.tenantId, ctx.tenantIds));

        const accessibleTeamIds = new Set(accessibleTeams.map((t) => t.id));
        const forbiddenTeamIds = body.teamIds.filter((tid) => !accessibleTeamIds.has(tid));

        if (forbiddenTeamIds.length > 0) {
          return NextResponse.json(
            { ok: false, error: "Cannot associate teams outside your tenant" },
            { status: 403 }
          );
        }
      }

      await db.delete(productTeams).where(eq(productTeams.productId, id));
      if (body.teamIds.length > 0) {
        await db.insert(productTeams).values(
          body.teamIds.map((teamId) => ({ productId: id, teamId }))
        );
      }
    }

    const updated = await db.query.products.findFirst({ where: eq(products.id, id) });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/products/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const product = await db.query.products.findFirst({ where: eq(products.id, id) });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Delete associated records
    await db.delete(productTeams).where(eq(productTeams.productId, id));
    await db.delete(products).where(eq(products.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/products/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
