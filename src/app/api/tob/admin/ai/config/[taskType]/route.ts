import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiConfigs } from "@/drizzle/schema";
import { badRequest, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";
import {
  AI_TASK_TYPES,
  ALL_AI_PROVIDERS,
  OPENAI_API_MODES,
  safeAIBaseUrl,
  isProviderAllowedForTask,
} from "@/lib/ai-config";
import { clearConfigCache } from "@/services/ai/config";
import { AI_CONFIG_SECRET_PURPOSE } from "@/services/ai/config";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";

const taskTypeEnum = z.enum(AI_TASK_TYPES);
const providerEnum = z.enum(ALL_AI_PROVIDERS);
const baseUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .max(2_048)
      .refine((value) => safeAIBaseUrl(value) !== null, {
        message: "baseUrl must be a public HTTPS URL on port 443",
      })
      .transform((value) => safeAIBaseUrl(value) as string),
  ])
);

const updateConfigSchema = z.object({
  provider: providerEnum.optional(),
  apiMode: z.enum(OPENAI_API_MODES).optional(),
  model: z.string().min(1).max(200).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
});

async function findConfigByTaskType(ctx: AuthedContext) {
  const parsed = taskTypeEnum.safeParse(ctx.params.taskType);
  if (!parsed.success) throw notFound();

  const config = await ctx.db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, parsed.data),
  });
  if (!config) throw notFound();
  return config;
}

export const GET = withAuth({ permission: "ai.config" }, async (_req: NextRequest, ctx) => {
  const config = await findConfigByTaskType(ctx);

  // Never return any part of the stored API key.
  return ok({
    ...config,
    apiKey: "",
    hasKey: Boolean(config.apiKey),
  });
});

export const PATCH = withAuth({ permission: "ai.config" }, async (req: NextRequest, ctx) => {
  const existing = await findConfigByTaskType(ctx);
  const body = await parseBody(req, updateConfigSchema);
  const nextProvider = body.provider ?? existing.provider;
  if (!isProviderAllowedForTask(existing.taskType, nextProvider)) {
    throw badRequest("Provider is not supported for this AI task");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.provider) updates.provider = body.provider;
  if (body.apiMode) updates.apiMode = body.apiMode;
  if (body.model) updates.model = body.model;
  if (body.apiKey) {
    updates.apiKey = await sealSecret(
      body.apiKey,
      getEnv().AUTH_SECRET,
      AI_CONFIG_SECRET_PURPOSE(existing.taskType)
    );
  }
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  await ctx.db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, existing.id));
  clearConfigCache(existing.taskType);

  return ok({ updated: true });
});

export const DELETE = withAuth({ permission: "ai.config" }, async (_req: NextRequest, ctx) => {
  const existing = await findConfigByTaskType(ctx);

  await ctx.db.delete(aiConfigs).where(eq(aiConfigs.id, existing.id));
  clearConfigCache(existing.taskType);

  return ok({ deleted: true });
});
