import { and, eq, gt, isNull } from "drizzle-orm";
import { accountApiKeys, productKeys } from "@/drizzle/schema";

/** Compare security configuration, excluding telemetry updated by normal use. */
export function activeAccountKeySnapshot(key: typeof accountApiKeys.$inferSelect) {
  return and(
    eq(accountApiKeys.id, key.id),
    eq(accountApiKeys.userId, key.userId),
    eq(accountApiKeys.secretHash, key.secretHash),
    eq(accountApiKeys.name, key.name),
    eq(accountApiKeys.permissions, key.permissions),
    eq(accountApiKeys.resourceMode, key.resourceMode),
    eq(accountApiKeys.productIds, key.productIds),
    eq(accountApiKeys.expiresAt, key.expiresAt),
    isNull(accountApiKeys.revokedAt),
    gt(accountApiKeys.expiresAt, new Date().toISOString()),
  );
}

export function productKeySnapshot(key: typeof productKeys.$inferSelect) {
  return and(
    eq(productKeys.id, key.id),
    eq(productKeys.productId, key.productId),
    eq(productKeys.secretHash, key.secretHash),
    key.name === null ? isNull(productKeys.name) : eq(productKeys.name, key.name),
    key.revoked === null
      ? isNull(productKeys.revoked)
      : eq(productKeys.revoked, key.revoked),
    key.expiresAt === null
      ? isNull(productKeys.expiresAt)
      : eq(productKeys.expiresAt, key.expiresAt),
  );
}
