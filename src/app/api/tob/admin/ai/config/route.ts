import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { aiConfigs } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { eq } from "drizzle-orm";
import { resolveUserContext, isSuperAdmin } from "@/lib/api-utils";

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

    // Only SuperAdmin can manage AI configs
    if (!ctx || !isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const configs = await db.select().from(aiConfigs);

    // Mask API keys
    const maskedConfigs = configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? "***" + c.apiKey.slice(-4) : "",
    }));

    return NextResponse.json({ ok: true, data: maskedConfigs });
  } catch (error) {
    console.error("Error in GET /api/tob/admin/ai/config:", error);
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

    // Only SuperAdmin can manage AI configs
    if (!ctx || !isSuperAdmin(ctx.user.role as Role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      taskType: string;
      provider: string;
      model: string;
      apiKey: string;
      baseUrl?: string;
      enabled?: boolean;
    };

    if (!body.taskType || !body.provider || !body.model || !body.apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const existing = await db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.taskType, body.taskType as "agent" | "prescreening" | "prereply" | "embedding"),
    });

    if (existing) {
      await db
        .update(aiConfigs)
        .set({
          provider: body.provider as "openai" | "anthropic" | "google" | "xai" | "deepseek",
          model: body.model,
          apiKey: body.apiKey,
          baseUrl: body.baseUrl || null,
          enabled: body.enabled ?? true,
          updatedAt: now,
        })
        .where(eq(aiConfigs.id, existing.id));

      return NextResponse.json({ ok: true, data: { id: existing.id } });
    }

    const id = crypto.randomUUID();
    await db.insert(aiConfigs).values({
      id,
      taskType: body.taskType as "agent" | "prescreening" | "prereply" | "embedding",
      provider: body.provider as "openai" | "anthropic" | "google" | "xai" | "deepseek",
      model: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl || null,
      enabled: body.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/tob/admin/ai/config:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
