import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productKeys, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { resolveUserContext } from "@/lib/api-utils";
import { eq } from "drizzle-orm";

export async function POST(
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

    if (key.revoked) {
      return NextResponse.json({ ok: false, error: "Cannot rotate revoked key" }, { status: 400 });
    }

    // Generate new secret
    const newSecret =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    await db
      .update(productKeys)
      .set({ secret: newSecret })
      .where(eq(productKeys.id, id));

    // Return full new secret
    return NextResponse.json({
      ok: true,
      data: {
        id,
        secret: `${id}.${newSecret}`,
        rotatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/product-keys/[id]/rotate:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
