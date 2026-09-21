import { desc, eq } from "drizzle-orm";
import { accountApiKeys, products } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  hasAgentReassignmentTeam,
  productScopeCondition,
} from "@/lib/api/scope";
import { generateAccountApiKey } from "@/lib/api-keys/auth";
import { availableApiKeyOperations } from "@/lib/api-keys/catalog";
import {
  accountKeySchema,
  accountKeyView,
  assertKeyManagement,
  validateAccountKeyInput,
} from "@/lib/api-keys/manage";
import { assertCanonicalTobOrigin } from "@/lib/auth/origin";
import { enforceStrictRateLimit } from "@/lib/rate-limit";

export const GET = withAuth({ sessionOnly: true }, async (_req, ctx) => {
  assertKeyManagement(ctx);
  const keys = await ctx.db
    .select()
    .from(accountApiKeys)
    .where(eq(accountApiKeys.userId, ctx.user.id))
    .orderBy(desc(accountApiKeys.createdAt));
  const operations = availableApiKeyOperations(
    ctx.role,
    "all",
    await hasAgentReassignmentTeam(ctx),
  );
  const productRows = await ctx.db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(productScopeCondition(ctx));
  return ok({
    keys: keys.map(accountKeyView),
    operations: operations.map(({ id, method, path, productScoped }) => ({
      id,
      method,
      path,
      productScoped,
    })),
    products: productRows,
  });
});

export const POST = withAuth({ sessionOnly: true }, async (req, ctx) => {
  assertKeyManagement(ctx);
  assertCanonicalTobOrigin(req, "API key management");
  await enforceStrictRateLimit(
    ctx.db,
    req,
    "account-api-key:create",
    { limit: 20, windowSeconds: 3600 },
    ctx.user.id,
  );
  const input = await validateAccountKeyInput(
    ctx,
    await parseBody(req, accountKeySchema, 32 * 1024),
  );
  const generated = await generateAccountApiKey();
  const key = {
    ...input,
    id: generated.id,
    userId: ctx.user.id,
    secretHash: generated.secretHash,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  await ctx.db.insert(accountApiKeys).values(key);
  return ok({ ...accountKeyView(key), apiKey: generated.plaintext }, 201);
});
