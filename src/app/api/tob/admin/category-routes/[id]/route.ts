import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { categoryRoutes, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { resolveUserContext } from "@/lib/api-utils";
import { eq } from "drizzle-orm";

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

    if (!hasPermission(ctx.user.role as Role, "category.map")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const route = await db.query.categoryRoutes.findFirst({
      where: eq(categoryRoutes.id, id),
    });

    if (!route) {
      return NextResponse.json({ ok: false, error: "Route not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, route.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: route });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/category-routes/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "category.map")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const route = await db.query.categoryRoutes.findFirst({
      where: eq(categoryRoutes.id, id),
    });

    if (!route) {
      return NextResponse.json({ ok: false, error: "Route not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, route.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      category?: string;
      subcategory?: string | null;
      teamId?: string;
    };

    await db
      .update(categoryRoutes)
      .set({
        ...(body.category !== undefined && { category: body.category }),
        ...(body.subcategory !== undefined && { subcategory: body.subcategory }),
        ...(body.teamId !== undefined && { teamId: body.teamId }),
      })
      .where(eq(categoryRoutes.id, id));

    const updated = await db.query.categoryRoutes.findFirst({
      where: eq(categoryRoutes.id, id),
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/category-routes/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "category.map")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const route = await db.query.categoryRoutes.findFirst({
      where: eq(categoryRoutes.id, id),
    });

    if (!route) {
      return NextResponse.json({ ok: false, error: "Route not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, route.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await db.delete(categoryRoutes).where(eq(categoryRoutes.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/category-routes/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
