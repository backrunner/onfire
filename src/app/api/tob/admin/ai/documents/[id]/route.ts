import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productDocuments } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, verifyProductOwnership } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx || !hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const document = await db.query.productDocuments.findFirst({
      where: eq(productDocuments.id, id),
    });

    if (!document) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, document.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: document });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/documents/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx || !hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.query.productDocuments.findFirst({
      where: eq(productDocuments.id, id),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, existing.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // TODO: Delete from R2
    // await env.R2_BUCKET.delete(existing.r2Key);

    await db.delete(productDocuments).where(eq(productDocuments.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/ai/documents/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx || !hasPermission(ctx.user.role as Role, "product.manage")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json()) as { action: string };

    const existing = await db.query.productDocuments.findFirst({
      where: eq(productDocuments.id, id),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, existing.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (body.action === "reprocess") {
      // Trigger reprocessing
      await db
        .update(productDocuments)
        .set({
          status: "pending",
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(productDocuments.id, id));

      // TODO: Trigger async processing job

      return NextResponse.json({ ok: true, message: "Reprocessing started" });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/ai/documents/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
