import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { accountApiKeys } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { ApiError, forbidden, unauthorized } from "@/lib/api/response";
import { assertCanonicalTobOrigin } from "@/lib/auth/origin";
import { randomHex, sha256Hex, timingSafeEqual } from "@/lib/crypto";
import type { Database } from "@/lib/db";
import { enforceStrictRateLimit } from "@/lib/rate-limit";
import { availableApiKeyOperations, matchingApiKeyOperations } from "./catalog";
import { hasAgentReassignmentTeam } from "@/lib/api/scope";
import { activeAccountKeySnapshot } from "./snapshot";

export const ACCOUNT_API_KEY_PREFIX = "ofk_";
export const MAX_KEY_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

export async function generateAccountApiKey() {
  const id = crypto.randomUUID();
  const secret = randomHex(32);
  return {
    id,
    secretHash: await sha256Hex(secret),
    plaintext: `${ACCOUNT_API_KEY_PREFIX}${id}.${secret}`,
  };
}

export function validateKeyExpiry(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= now ||
    timestamp > now + MAX_KEY_LIFETIME_MS
  ) {
    throw new ApiError(
      400,
      "Key expiry must be in the future and within 365 days",
    );
  }
  return new Date(timestamp).toISOString();
}

export async function verifyAccountApiKey(db: Database, req: NextRequest) {
  if (req.headers.has("origin")) assertCanonicalTobOrigin(req, "API key");
  await enforceStrictRateLimit(db, req, "account-api-key:ip", {
    limit: 300,
    windowSeconds: 60,
  });
  const match = /^Bearer ofk_([a-f0-9-]{36})\.([a-f0-9]{64})$/i.exec(
    req.headers.get("authorization") ?? "",
  );
  if (!match) throw unauthorized();
  const key = await db.query.accountApiKeys.findFirst({
    where: eq(accountApiKeys.id, match[1]),
  });
  if (
    !key ||
    key.revokedAt ||
    !(Date.parse(key.expiresAt) > Date.now()) ||
    !(await timingSafeEqual(await sha256Hex(match[2]), key.secretHash))
  )
    throw unauthorized();
  if (
    !Array.isArray(key.permissions) ||
    !key.permissions.length ||
    !key.permissions.every((p) => typeof p === "string") ||
    !Array.isArray(key.productIds) ||
    !key.productIds.every((p) => typeof p === "string") ||
    !["all", "products"].includes(key.resourceMode) ||
    (key.resourceMode === "products" && !key.productIds.length) ||
    (key.resourceMode === "all" && key.productIds.length)
  )
    throw unauthorized();
  await enforceStrictRateLimit(
    db,
    req,
    "account-api-key:key",
    { limit: 120, windowSeconds: 60 },
    key.id,
  );
  return key;
}

export async function authorizeApiKeyRequest(
  req: NextRequest,
  ctx: AuthedContext,
  key: typeof accountApiKeys.$inferSelect,
) {
  const operations = availableApiKeyOperations(
    ctx.role,
    key.resourceMode,
    await hasAgentReassignmentTeam(ctx),
  );
  const effectivePermissions = operations
    .filter((op) => key.permissions.includes(op.id))
    .map((op) => op.id);
  const path = new URL(req.url).pathname;
  if (
    !(req.method === "GET" && path === "/api/tob/api-key") &&
    !matchingApiKeyOperations(req.method, path, ctx.params).some((op) =>
      effectivePermissions.includes(op.id),
    )
  ) {
    throw forbidden("API key does not permit this operation");
  }
  ctx.apiKey = {
    id: key.id,
    name: key.name,
    permissions: effectivePermissions,
    expiresAt: key.expiresAt,
    resourceMode: key.resourceMode,
    productIds: key.productIds,
  };
  if (key.resourceMode === "products")
    ctx.delegatedResourceScope = {
      mode: "selected",
      tenantIds: [],
      productIds: key.productIds,
    };
  // Role/scope resolution may yield to another request. Consume only the exact
  // grant that was verified, still live at the authorization decision point.
  const accepted = await ctx.db
    .update(accountApiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(activeAccountKeySnapshot(key))
    .returning({ id: accountApiKeys.id });
  if (!accepted.length) throw unauthorized();
}

/** Branch-specific grants on routes that support more than one action. */
export function assertApiKeyPermission(ctx: AuthedContext, permission: string) {
  if (ctx.apiKey && !ctx.apiKey.permissions.includes(permission))
    throw forbidden("API key does not permit this operation");
}
