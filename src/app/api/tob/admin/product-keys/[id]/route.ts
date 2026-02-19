import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productKeys, products } from "@/drizzle/schema";
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

    if (!hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const key = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });

    if (!key) {
      return NextResponse.json({ ok: false, error: "Key not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, key.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Mask secret
    return NextResponse.json({
      ok: true,
      data: {
        ...key,
        secret: key.secret.substring(0, 8) + "..." + key.secret.substring(key.secret.length - 4),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/product-keys/[id]:", error);
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

    const key = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });

    if (!key) {
      return NextResponse.json({ ok: false, error: "Key not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, key.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      revoked?: boolean;
    };

    await db
      .update(productKeys)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.revoked !== undefined && { revoked: body.revoked }),
      })
      .where(eq(productKeys.id, id));

    const updated = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });

    return NextResponse.json({
      ok: true,
      data: updated
        ? {
            ...updated,
            secret:
              updated.secret.substring(0, 8) +
              "..." +
              updated.secret.substring(updated.secret.length - 4),
          }
        : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/product-keys/[id]:", error);
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

    const key = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });

    if (!key) {
      return NextResponse.json({ ok: false, error: "Key not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, key.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await db.delete(productKeys).where(eq(productKeys.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/product-keys/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
