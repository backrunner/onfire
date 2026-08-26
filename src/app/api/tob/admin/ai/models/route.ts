import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { aiCredentials } from "@/drizzle/schema";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ok, badRequest, forbidden, notFound } from "@/lib/api/response";
import { getEnv } from "@/lib/db";
import { openStoredSecret } from "@/lib/secret-storage";
import { assertCanManageAiScope } from "@/lib/ai-scope";
import { parseFilledAiScope } from "../scope-query";
import { listProviderModels } from "@/services/ai/model-catalog";

const querySchema = z.object({ credentialId: z.string().min(1) });

export const GET = withAuth({}, async (req: NextRequest, ctx) => {
  const { credentialId } = parseQuery(req, querySchema);
  const ref = await parseFilledAiScope(req, ctx.db);
  await assertCanManageAiScope(ctx, ref);
  const credential = await ctx.db.query.aiCredentials.findFirst({
    where: eq(aiCredentials.id, credentialId),
  });
  if (!credential) throw notFound();
  const allowed = credential.scope === "system" ||
    (credential.scope === "tenant" && credential.tenantId === ref.tenantId) ||
    (credential.scope === "product" && credential.productId === ref.productId);
  if (!allowed) throw forbidden("Credential is outside the selected AI scope");
  const apiKey = await openStoredSecret(
    credential.apiKey,
    getEnv().AUTH_SECRET,
    credential.secretPurpose,
  );
  try {
    return ok({ models: await listProviderModels(credential.provider, apiKey, credential.baseUrl) });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Unable to load provider models");
  }
});
