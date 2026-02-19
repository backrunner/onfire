import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productDocuments } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq, inArray, desc } from "drizzle-orm";
import {
  resolveUserContext,
  verifyProductOwnership,
  getAccessibleProductIds,
} from "@/lib/api-utils";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    // Verify product ownership if productId is specified
    if (productId) {
      const hasAccess = await verifyProductOwnership(db, productId, ctx.tenantIds);
      if (!hasAccess) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      const documents = await db
        .select()
        .from(productDocuments)
        .where(eq(productDocuments.productId, productId))
        .orderBy(desc(productDocuments.createdAt));
      return NextResponse.json({ ok: true, data: documents });
    }

    // Get all accessible products and their documents
    const accessibleProductIds = await getAccessibleProductIds(db, ctx.tenantIds);
    if (accessibleProductIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const documents = await db
      .select()
      .from(productDocuments)
      .where(inArray(productDocuments.productId, accessibleProductIds))
      .orderBy(desc(productDocuments.createdAt));

    return NextResponse.json({ ok: true, data: documents });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/documents:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    // Handle multipart form data for file upload
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const productId = formData.get("productId") as string | null;

    if (!file || !productId) {
      return NextResponse.json(
        { ok: false, error: "Missing file or productId" },
        { status: 400 }
      );
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type" },
        { status: 400 }
      );
    }

    // In a real implementation, you would upload to R2 here
    // For now, we'll create a placeholder record
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const r2Key = `documents/${productId}/${id}/${file.name}`;

    await db.insert(productDocuments).values({
      id,
      productId,
      filename: file.name,
      r2Key,
      mimeType: file.type,
      sizeBytes: file.size,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // TODO: Upload file to R2 and trigger processing
    // const arrayBuffer = await file.arrayBuffer();
    // await env.R2_BUCKET.put(r2Key, arrayBuffer);

    return NextResponse.json({ ok: true, data: { id, r2Key } }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/ai/documents:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
