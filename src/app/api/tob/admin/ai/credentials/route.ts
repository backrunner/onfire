import { NextRequest } from "next/server";
import { z } from "zod";
import { asc, count, eq } from "drizzle-orm";
import { aiCredentials, aiTaskCredentials } from "@/drizzle/schema";
import { withAuth, parseBody } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  ALL_AI_PROVIDERS,
  OPENAI_API_MODES,
  safeAIBaseUrl,
} from "@/lib/ai-config";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { AI_CREDENTIAL_SECRET_PURPOSE } from "@/services/ai/config";

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

const createCredentialSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(ALL_AI_PROVIDERS),
  apiMode: z.enum(OPENAI_API_MODES).default("responses"),
  apiKey: z.string().trim().min(1).max(500),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
});

export const GET = withAuth(
  { permission: "ai.config" },
  async (_req: NextRequest, ctx) => {
    const rows = await ctx.db
      .select({
        id: aiCredentials.id,
        name: aiCredentials.name,
        provider: aiCredentials.provider,
        apiMode: aiCredentials.apiMode,
        apiKey: aiCredentials.apiKey,
        baseUrl: aiCredentials.baseUrl,
        enabled: aiCredentials.enabled,
        cooldownSeconds: aiCredentials.cooldownSeconds,
        blockedUntil: aiCredentials.blockedUntil,
        failureCount: aiCredentials.failureCount,
        lastFailureAt: aiCredentials.lastFailureAt,
        lastFailureMessage: aiCredentials.lastFailureMessage,
        lastSuccessAt: aiCredentials.lastSuccessAt,
        lastUsedAt: aiCredentials.lastUsedAt,
        createdAt: aiCredentials.createdAt,
        updatedAt: aiCredentials.updatedAt,
        usageCount: count(aiTaskCredentials.id),
      })
      .from(aiCredentials)
      .leftJoin(
        aiTaskCredentials,
        eq(aiTaskCredentials.credentialId, aiCredentials.id)
      )
      .groupBy(aiCredentials.id)
      .orderBy(asc(aiCredentials.name));

    return ok(
      rows.map(({ apiKey, ...row }) => ({
        ...row,
        hasKey: Boolean(apiKey),
      }))
    );
  }
);

export const POST = withAuth(
  { permission: "ai.config" },
  async (req: NextRequest, ctx) => {
    const body = await parseBody(req, createCredentialSchema);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const purpose = AI_CREDENTIAL_SECRET_PURPOSE(id);
    const apiKey = await sealSecret(body.apiKey, getEnv().AUTH_SECRET, purpose);

    await ctx.db.insert(aiCredentials).values({
      id,
      name: body.name,
      provider: body.provider,
      apiMode: body.apiMode,
      apiKey,
      secretPurpose: purpose,
      baseUrl: body.baseUrl ?? null,
      enabled: body.enabled ?? true,
      cooldownSeconds: body.cooldownSeconds ?? 60,
      createdAt: now,
      updatedAt: now,
    });

    return ok({ id }, 201);
  }
);
