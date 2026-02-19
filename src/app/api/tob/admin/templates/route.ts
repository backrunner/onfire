import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { templates, products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { resolveUserContext } from "@/lib/api-utils";
import { eq, inArray } from "drizzle-orm";

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

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

    if (!hasPermission(ctx.user.role as Role, "template.read")) {
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

    let templateList;
    if (productId) {
      if (!accessibleProductIds.includes(productId)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      templateList = await db
        .select()
        .from(templates)
        .where(eq(templates.productId, productId));
    } else {
      templateList = await db
        .select()
        .from(templates)
        .where(inArray(templates.productId, accessibleProductIds));
    }

    const enriched = templateList.map((t) => ({
      ...t,
      categories: parseJson(t.categories),
      formSchema: parseJson(t.formSchema),
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/templates:", error);
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

    if (!hasPermission(ctx.user.role as Role, "template.write")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      productId: string;
      title: string;
      categories: string[];
      formSchema: Record<string, unknown>;
    };

    if (!body.productId || !body.title) {
      return NextResponse.json(
        { ok: false, error: "productId and title are required" },
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

    await db.insert(templates).values({
      id,
      productId: body.productId,
      title: body.title,
      categories: JSON.stringify(body.categories || []),
      formSchema: JSON.stringify(body.formSchema || {}),
    });

    const created = await db.query.templates.findFirst({ where: eq(templates.id, id) });

    return NextResponse.json(
      {
        ok: true,
        data: created
          ? {
              ...created,
              categories: parseJson(created.categories),
              formSchema: parseJson(created.formSchema),
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/tob/admin/templates:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
