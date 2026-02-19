import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { products } from "@/drizzle/schema";
import { hasPermission, Role } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";
import { resolveUserContext } from "@/lib/api-utils";

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

    const productList = await db
      .select()
      .from(products)
      .where(inArray(products.tenantId, ctx.tenantIds));

    return NextResponse.json({ ok: true, data: productList });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/products:", error);
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
      name: string;
      tenantId?: string;
      slaHighAccept?: number;
      slaHighReply?: number;
      slaMediumAccept?: number;
      slaMediumReply?: number;
      slaLowAccept?: number;
      slaLowReply?: number;
      autoCloseMinutes?: number;
    };

    if (!body.name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const tenantId = body.tenantId || ctx.tenantIds[0];

    if (!ctx.tenantIds.includes(tenantId)) {
      return NextResponse.json({ ok: false, error: "Invalid tenantId" }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db.insert(products).values({
      id,
      tenantId,
      name: body.name,
      slaHighAccept: body.slaHighAccept,
      slaHighReply: body.slaHighReply,
      slaMediumAccept: body.slaMediumAccept,
      slaMediumReply: body.slaMediumReply,
      slaLowAccept: body.slaLowAccept,
      slaLowReply: body.slaLowReply,
      autoCloseMinutes: body.autoCloseMinutes,
    });

    const created = await db.query.products.findFirst({ where: eq(products.id, id) });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/products:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
