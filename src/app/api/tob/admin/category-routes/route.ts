import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { categoryRoutes, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { resolveUserContext } from "@/lib/api-utils";
import { eq, inArray } from "drizzle-orm";

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

    if (!hasPermission(ctx.user.role as Role, "category.map")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    // Get accessible products
    const accessibleProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.tenantId, ctx.tenantIds));
    const accessibleProductIds = accessibleProducts.map((p) => p.id);

    let routeList;
    if (productId) {
      if (!accessibleProductIds.includes(productId)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      routeList = await db
        .select()
        .from(categoryRoutes)
        .where(eq(categoryRoutes.productId, productId));
    } else {
      routeList = await db
        .select()
        .from(categoryRoutes)
        .where(inArray(categoryRoutes.productId, accessibleProductIds));
    }

    return NextResponse.json({ ok: true, data: routeList });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/category-routes:", error);
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

    if (!hasPermission(ctx.user.role as Role, "category.map")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      productId: string;
      category: string;
      subcategory?: string;
      teamId: string;
    };

    if (!body.productId || !body.category || !body.teamId) {
      return NextResponse.json(
        { ok: false, error: "productId, category, and teamId are required" },
        { status: 400 }
      );
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Invalid productId" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(categoryRoutes).values({
      id,
      productId: body.productId,
      category: body.category,
      subcategory: body.subcategory,
      teamId: body.teamId,
    });

    const created = await db.query.categoryRoutes.findFirst({
      where: eq(categoryRoutes.id, id),
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/category-routes:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
