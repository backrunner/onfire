import { and, eq } from "drizzle-orm";
import { accountApiKeys } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, notFound, ok } from "@/lib/api/response";
import {
  accountKeySchema,
  accountKeyView,
  assertKeyManagement,
  validateAccountKeyInput,
} from "@/lib/api-keys/manage";
import { assertCanonicalTobOrigin } from "@/lib/auth/origin";
import { activeAccountKeySnapshot } from "@/lib/api-keys/snapshot";

export const PATCH = withAuth({ sessionOnly: true }, async (req, ctx) => {
  assertKeyManagement(ctx);
  assertCanonicalTobOrigin(req, "API key management");
  const where = and(
    eq(accountApiKeys.id, ctx.params.id),
    eq(accountApiKeys.userId, ctx.user.id),
  );
  const key = await ctx.db.query.accountApiKeys.findFirst({ where });
  if (!key) throw notFound("Key not found");
  if (key.revokedAt || Date.parse(key.expiresAt) <= Date.now())
    throw badRequest("Expired or revoked keys cannot be changed");
  const input = await validateAccountKeyInput(
    ctx,
    await parseBody(req, accountKeySchema, 32 * 1024),
  );
  // Credential rotation is explicit: create a replacement, then revoke the old one.
  // Editing an existing secret cannot lengthen its original lifetime.
  if (Date.parse(input.expiresAt) > Date.parse(key.expiresAt))
    throw badRequest("Create a new key to extend its lifetime");
  const changed = await ctx.db
    .update(accountApiKeys)
    .set(input)
    .where(activeAccountKeySnapshot(key))
    .returning({ id: accountApiKeys.id });
  if (!changed.length) throw conflict("Key changed; reload before editing");
  return ok(accountKeyView({ ...key, ...input }));
});

export const DELETE = withAuth({ sessionOnly: true }, async (req, ctx) => {
  assertKeyManagement(ctx);
  assertCanonicalTobOrigin(req, "API key management");
  const where = and(
    eq(accountApiKeys.id, ctx.params.id),
    eq(accountApiKeys.userId, ctx.user.id),
  );
  const key = await ctx.db.query.accountApiKeys.findFirst({ where });
  if (!key) throw notFound("Key not found");
  await ctx.db
    .update(accountApiKeys)
    .set({ revokedAt: key.revokedAt ?? new Date().toISOString() })
    .where(where);
  return ok({ revoked: true });
});
