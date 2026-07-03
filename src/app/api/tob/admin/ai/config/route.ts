import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiConfigs } from "@/drizzle/schema";
import { ok, forbidden } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";

const taskTypeEnum = z.enum(["agent", "prescreening", "prereply", "embedding"]);
const providerEnum = z.enum(["openai", "anthropic", "google", "xai", "deepseek"]);

/** Never return the stored API key; expose only a short masked prefix. */
function maskAiConfig<T extends { apiKey: string | null }>(config: T) {
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}...` : "",
    hasKey: Boolean(config.apiKey),
  };
}

const createConfigSchema = z.object({
  taskType: taskTypeEnum,
  provider: providerEnum,
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(500),
  baseUrl: z.url().optional(),
  enabled: z.boolean().optional(),
});

export const GET = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  // AI configs are global — only SuperAdmin may manage them
  if (!ctx.isSuperAdmin) throw forbidden();

  const configs = await ctx.db.select().from(aiConfigs);

  return ok(configs.map(maskAiConfig));
});

export const POST = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  // AI configs are global — only SuperAdmin may manage them
  if (!ctx.isSuperAdmin) throw forbidden();

  const body = await parseBody(req, createConfigSchema);

  const now = new Date().toISOString();
  const existing = await ctx.db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, body.taskType),
  });

  if (existing) {
    await ctx.db
      .update(aiConfigs)
      .set({
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
        baseUrl: body.baseUrl || null,
        enabled: body.enabled ?? true,
        updatedAt: now,
      })
      .where(eq(aiConfigs.id, existing.id));

    return ok({ id: existing.id });
  }

  const id = crypto.randomUUID();
  await ctx.db.insert(aiConfigs).values({
    id,
    taskType: body.taskType,
    provider: body.provider,
    model: body.model,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl || null,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  return ok({ id }, 201);
});
