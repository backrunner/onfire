import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiCredentials, aiTaskCredentials } from "@/drizzle/schema";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { badRequest, notFound, ok } from "@/lib/api/response";
import {
  ALL_AI_PROVIDERS,
  OPENAI_API_MODES,
  isProviderAllowedForTask,
  safeAIBaseUrl,
} from "@/lib/ai-config";
import { getEnv } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { AI_CREDENTIAL_SECRET_PURPOSE } from "@/services/ai/config";
import { assertCanManageAiScope } from "@/lib/ai-scope";

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

const updateCredentialSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  provider: z.enum(ALL_AI_PROVIDERS).optional(),
  apiMode: z.enum(OPENAI_API_MODES).optional(),
  apiKey: z.string().trim().min(1).max(500).optional(),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
  resetHealth: z.boolean().optional(),
});

async function findCredential(ctx: AuthedContext) {
  const credential = await ctx.db.query.aiCredentials.findFirst({
    where: eq(aiCredentials.id, ctx.params.id),
  });
  if (!credential) throw notFound();
  await assertCanManageAiScope(ctx, {
    scope: credential.scope,
    tenantId: credential.tenantId,
    productId: credential.productId,
  });
  return credential;
}

export const PATCH = withAuth(
  {},
  async (req: NextRequest, ctx) => {
    const existing = await findCredential(ctx);
    const body = await parseBody(req, updateCredentialSchema);
    const nextProvider = body.provider ?? existing.provider;

    if (body.provider && body.provider !== existing.provider) {
      const routes = await ctx.db
        .select({ taskType: aiTaskCredentials.taskType })
        .from(aiTaskCredentials)
        .where(eq(aiTaskCredentials.credentialId, existing.id));
      if (
        routes.some(
          (route) => !isProviderAllowedForTask(route.taskType, nextProvider)
        )
      ) {
        throw badRequest(
          "Remove incompatible task routes before changing this provider"
        );
      }
    }

    const now = new Date().toISOString();
    const updates: Partial<typeof aiCredentials.$inferInsert> = {
      updatedAt: now,
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.apiMode !== undefined) updates.apiMode = body.apiMode;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.cooldownSeconds !== undefined) {
      updates.cooldownSeconds = body.cooldownSeconds;
    }
    if (body.apiKey !== undefined) {
      const purpose = AI_CREDENTIAL_SECRET_PURPOSE(existing.id);
      updates.apiKey = await sealSecret(
        body.apiKey,
        getEnv().AUTH_SECRET,
        purpose
      );
      updates.secretPurpose = purpose;
    }
    if (body.resetHealth) {
      updates.blockedUntil = null;
      updates.failureCount = 0;
      updates.lastFailureAt = null;
      updates.lastFailureMessage = null;
    }

    await ctx.db
      .update(aiCredentials)
      .set(updates)
      .where(eq(aiCredentials.id, existing.id));

    return ok({ updated: true });
  }
);

export const DELETE = withAuth(
  {},
  async (_req: NextRequest, ctx) => {
    const existing = await findCredential(ctx);
    await ctx.db.batch([
      ctx.db
        .delete(aiTaskCredentials)
        .where(eq(aiTaskCredentials.credentialId, existing.id)),
      ctx.db.delete(aiCredentials).where(eq(aiCredentials.id, existing.id)),
    ]);
    return ok({ deleted: true });
  }
);
