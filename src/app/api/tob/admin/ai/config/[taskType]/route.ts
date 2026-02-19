import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { aiConfigs } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, isSuperAdmin } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskType: string }> }
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

    // Only SuperAdmin can manage AI configs
    if (!ctx || !isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { taskType } = await params;
    const config = await db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.taskType, taskType as "agent" | "prescreening" | "prereply" | "embedding"),
    });

    if (!config) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...config,
        apiKey: config.apiKey ? "***" + config.apiKey.slice(-4) : "",
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/config/[taskType]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskType: string }> }
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

    // Only SuperAdmin can manage AI configs
    if (!ctx || !isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { taskType } = await params;
    const body = (await request.json()) as {
      provider?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string | null;
      enabled?: boolean;
    };

    const existing = await db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.taskType, taskType as "agent" | "prescreening" | "prereply" | "embedding"),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.provider) updates.provider = body.provider;
    if (body.model) updates.model = body.model;
    if (body.apiKey) updates.apiKey = body.apiKey;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    await db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, existing.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in PATCH /api/tob/admin/ai/config/[taskType]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskType: string }> }
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

    // Only SuperAdmin can manage AI configs
    if (!ctx || !isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { taskType } = await params;
    const existing = await db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.taskType, taskType as "agent" | "prescreening" | "prereply" | "embedding"),
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await db.delete(aiConfigs).where(eq(aiConfigs.id, existing.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in DELETE /api/tob/admin/ai/config/[taskType]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
