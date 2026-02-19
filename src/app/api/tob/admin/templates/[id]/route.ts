import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { templates, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { resolveUserContext } from "@/lib/api-utils";
import { eq } from "drizzle-orm";

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

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

    if (!hasPermission(ctx.user.role as Role, "template.read")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const template = await db.query.templates.findFirst({ where: eq(templates.id, id) });

    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, template.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...template,
        categories: parseJson(template.categories),
        formSchema: parseJson(template.formSchema),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/templates/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "template.write")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const template = await db.query.templates.findFirst({ where: eq(templates.id, id) });

    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, template.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      title?: string;
      categories?: string[];
      formSchema?: Record<string, unknown>;
    };

    await db
      .update(templates)
      .set({
        ...(body.title !== undefined && { title: body.title }),
        ...(body.categories !== undefined && { categories: JSON.stringify(body.categories) }),
        ...(body.formSchema !== undefined && { formSchema: JSON.stringify(body.formSchema) }),
      })
      .where(eq(templates.id, id));

    const updated = await db.query.templates.findFirst({ where: eq(templates.id, id) });

    return NextResponse.json({
      ok: true,
      data: updated
        ? {
            ...updated,
            categories: parseJson(updated.categories),
            formSchema: parseJson(updated.formSchema),
          }
        : null,
    });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/templates/[id]:", error);
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

    if (!hasPermission(ctx.user.role as Role, "template.write")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const template = await db.query.templates.findFirst({ where: eq(templates.id, id) });

    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    // Verify product access
    const product = await db.query.products.findFirst({
      where: eq(products.id, template.productId),
    });

    if (!product || !ctx.tenantIds.includes(product.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    await db.delete(templates).where(eq(templates.id, id));

    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/templates/[id]:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
