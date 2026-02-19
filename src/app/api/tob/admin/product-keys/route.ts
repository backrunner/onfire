import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productKeys, products } from "@/drizzle/schema";
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
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

    let keyList;
    if (productId) {
      if (!accessibleProductIds.includes(productId)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      keyList = await db
        .select()
        .from(productKeys)
        .where(eq(productKeys.productId, productId));
    } else {
      keyList = await db
        .select()
        .from(productKeys)
        .where(inArray(productKeys.productId, accessibleProductIds));
    }

    // Mask secrets
    const masked = keyList.map((k) => ({
      ...k,
      secret: k.secret.substring(0, 8) + "..." + k.secret.substring(k.secret.length - 4),
    }));

    return NextResponse.json({ ok: true, data: masked });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/product-keys:", error);
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      productId: string;
      name?: string;
    };

    if (!body.productId) {
      return NextResponse.json({ ok: false, error: "productId is required" }, { status: 400 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Invalid productId" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();

    await db.insert(productKeys).values({
      id,
      productId: body.productId,
      name: body.name,
      secret,
      createdAt: now,
    });

    // Return full secret only on creation
    return NextResponse.json(
      {
        ok: true,
        data: {
          id,
          productId: body.productId,
          name: body.name,
          secret: `${id}.${secret}`,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/tob/admin/product-keys:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
