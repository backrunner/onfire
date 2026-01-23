import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { templates } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

// GET /api/toc/templates - Get templates for a product
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { ok: false, error: "productId is required" },
        { status: 400 }
      );
    }

    const db = getDb();

    const templateList = await db
      .select()
      .from(templates)
      .where(eq(templates.productId, productId));

    // Parse JSON fields
    const parsed = templateList.map((t) => ({
      ...t,
      categories: JSON.parse(t.categories || "[]"),
      formSchema: JSON.parse(t.formSchema || "{}"),
    }));

    return NextResponse.json({
      ok: true,
      data: parsed,
    });
  } catch (error) {
    console.error("Error in GET /api/toc/templates:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
