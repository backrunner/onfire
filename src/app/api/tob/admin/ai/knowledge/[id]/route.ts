import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { productKnowledge, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { embedKnowledge } from "@/services/ai/embedding";
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
    const knowledge = await db.query.productKnowledge.findFirst({
      where: eq(productKnowledge.id, id),
    });

    if (!knowledge) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, knowledge.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: knowledge });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/knowledge/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = (await request.json()) as {
      title?: string;
      content?: string;
      knowledgeType?: string;
      reembed?: boolean;
    };

    const existing = await db.query.productKnowledge.findFirst({
      where: eq(productKnowledge.id, id),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, existing.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.title) updates.title = body.title;
    if (body.content) updates.content = body.content;
    if (body.knowledgeType) updates.knowledgeType = body.knowledgeType;

    await db.update(productKnowledge).set(updates).where(eq(productKnowledge.id, id));

    // Re-embed if content changed and requested
    if (body.reembed && (body.title || body.content)) {
      try {
        await embedKnowledge(db, id);
      } catch (error) {
        console.error("Failed to re-embed knowledge:", error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/ai/knowledge/[id]:", error);
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
    const existing = await db.query.productKnowledge.findFirst({
      where: eq(productKnowledge.id, id),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Verify product ownership
    const hasAccess = await verifyProductOwnership(db, existing.productId, ctx.tenantIds);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await db.delete(productKnowledge).where(eq(productKnowledge.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/ai/knowledge/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
