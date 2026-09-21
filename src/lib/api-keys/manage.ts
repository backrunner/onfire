import { z } from "zod";
import { accountApiKeys } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, forbidden } from "@/lib/api/response";
import { assertProductAccess, hasAgentReassignmentTeam } from "@/lib/api/scope";
import { availableApiKeyOperations } from "./catalog";
import { validateKeyExpiry } from "./auth";

export const accountKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.string().min(1).max(100)).min(1).max(200),
  resourceMode: z.enum(["all", "products"]),
  productIds: z.array(z.string().min(1).max(128)).max(100),
  expiresAt: z.iso.datetime({ offset: true }),
});

export function assertKeyManagement(ctx: AuthedContext) {
  if (ctx.preview || ctx.apiKey)
    throw forbidden("API keys can only be managed in your own browser session");
}

export async function validateAccountKeyInput(
  ctx: AuthedContext,
  input: z.infer<typeof accountKeySchema>,
) {
  assertKeyManagement(ctx);
  const expiresAt = validateKeyExpiry(input.expiresAt);
  const available = availableApiKeyOperations(
    ctx.role,
    input.resourceMode,
    await hasAgentReassignmentTeam(ctx),
  );
  if (
    new Set(input.permissions).size !== input.permissions.length ||
    input.permissions.some((id) => !available.some((op) => op.id === id))
  ) {
    throw badRequest("Invalid API key permissions");
  }
  if (
    new Set(input.productIds).size !== input.productIds.length ||
    (input.resourceMode === "products"
      ? !input.productIds.length
      : input.productIds.length > 0)
  )
    throw badRequest("Invalid API key resource scope");
  for (const productId of input.productIds)
    await assertProductAccess(ctx, productId);
  return { ...input, expiresAt };
}

export function accountKeyView(key: typeof accountApiKeys.$inferSelect) {
  return {
    id: key.id,
    name: key.name,
    permissions: key.permissions,
    resourceMode: key.resourceMode,
    productIds: key.productIds,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  };
}
