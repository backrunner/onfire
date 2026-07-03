import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiConfigs } from "@/drizzle/schema";
import { ok, forbidden, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";

const taskTypeEnum = z.enum(["agent", "prescreening", "prereply", "embedding"]);
const providerEnum = z.enum(["openai", "anthropic", "google", "xai", "deepseek"]);

const updateConfigSchema = z.object({
  provider: providerEnum.optional(),
  model: z.string().min(1).max(200).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: z.url().nullable().optional(),
  enabled: z.boolean().optional(),
});

async function findConfigByTaskType(ctx: AuthedContext) {
  // AI configs are global — only SuperAdmin may manage them
  if (!ctx.isSuperAdmin) throw forbidden();

  const parsed = taskTypeEnum.safeParse(ctx.params.taskType);
  if (!parsed.success) throw notFound();

  const config = await ctx.db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, parsed.data),
  });
  if (!config) throw notFound();
  return config;
}

export const GET = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const config = await findConfigByTaskType(ctx);

  // Never return the stored API key — mask it
  return ok({
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}...` : "",
    hasKey: Boolean(config.apiKey),
  });
});

export const PATCH = withAuth({ permission: "product.manage" }, async (req: NextRequest, ctx) => {
  const existing = await findConfigByTaskType(ctx);
  const body = await parseBody(req, updateConfigSchema);

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.provider) updates.provider = body.provider;
  if (body.model) updates.model = body.model;
  if (body.apiKey) updates.apiKey = body.apiKey;
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  await ctx.db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, existing.id));

  return ok({ updated: true });
});

export const DELETE = withAuth({ permission: "product.manage" }, async (_req: NextRequest, ctx) => {
  const existing = await findConfigByTaskType(ctx);

  await ctx.db.delete(aiConfigs).where(eq(aiConfigs.id, existing.id));

  return ok({ deleted: true });
});
