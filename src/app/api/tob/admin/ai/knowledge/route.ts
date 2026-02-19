import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productKnowledge, users, products } from "@/drizzle/schema";
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
      const knowledge = await db
        .select()
        .from(productKnowledge)
        .where(eq(productKnowledge.productId, productId))
        .orderBy(desc(productKnowledge.createdAt));
      return NextResponse.json({ ok: true, data: knowledge });
    }

    // Get all accessible products and their knowledge
    const accessibleProductIds = await getAccessibleProductIds(db, ctx.tenantIds);
    if (accessibleProductIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const knowledge = await db
      .select()
      .from(productKnowledge)
      .where(inArray(productKnowledge.productId, accessibleProductIds))
      .orderBy(desc(productKnowledge.createdAt));

    return NextResponse.json({ ok: true, data: knowledge });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/knowledge:", error);
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

    const body = (await request.json()) as {
      productId: string;
      title: string;
      content: string;
      knowledgeType: string;
    };

    if (!body.productId || !body.title || !body.content || !body.knowledgeType) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, body.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await db.insert(productKnowledge).values({
      id,
      productId: body.productId,
      title: body.title,
      content: body.content,
      knowledgeType: body.knowledgeType as "description" | "faq" | "feature" | "policy" | "troubleshooting",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/ai/knowledge:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
