import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiConfigs } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/response";
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

/** Never return any part of the stored API key. */
function maskAiConfig<T extends { apiKey: string | null }>(config: T) {
  return {
    ...config,
    apiKey: "",
    hasKey: Boolean(config.apiKey),
  };
}

const createConfigSchema = z.object({
  taskType: taskTypeEnum,
  provider: providerEnum,
  apiMode: z.enum(OPENAI_API_MODES).default("responses"),
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(500),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
});

export const GET = withAuth({ permission: "ai.config" }, async (_req: NextRequest, ctx) => {

  const configs = await ctx.db.select().from(aiConfigs);

  return ok(configs.map(maskAiConfig));
});

export const POST = withAuth({ permission: "ai.config" }, async (req: NextRequest, ctx) => {

  const body = await parseBody(req, createConfigSchema);
  if (!isProviderAllowedForTask(body.taskType, body.provider)) {
    throw badRequest("Provider is not supported for this AI task");
  }

  const now = new Date().toISOString();
  const sealedApiKey = await sealSecret(
    body.apiKey,
    getEnv().AUTH_SECRET,
    AI_CONFIG_SECRET_PURPOSE(body.taskType)
  );
  const existing = await ctx.db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, body.taskType),
  });

  if (existing) {
    await ctx.db
      .update(aiConfigs)
      .set({
        provider: body.provider,
        apiMode: body.apiMode,
        model: body.model,
        apiKey: sealedApiKey,
        baseUrl: body.baseUrl || null,
        enabled: body.enabled ?? true,
        updatedAt: now,
      })
      .where(eq(aiConfigs.id, existing.id));

    clearConfigCache(body.taskType);

    return ok({ id: existing.id });
  }

  const id = crypto.randomUUID();
  await ctx.db.insert(aiConfigs).values({
    id,
    taskType: body.taskType,
    provider: body.provider,
    apiMode: body.apiMode,
    model: body.model,
    apiKey: sealedApiKey,
    baseUrl: body.baseUrl || null,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  clearConfigCache(body.taskType);

  return ok({ id }, 201);
});
