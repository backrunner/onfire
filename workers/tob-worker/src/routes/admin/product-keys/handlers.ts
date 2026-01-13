import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { productKeys, type ProductKeyRow } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';
import { createApiKeyValue, maskApiKey, assertProductAccessible } from '../utils';

type ProductKeyQuery = Record<string, string | undefined>;

export const listProductKeys = async (env: Bindings, store: AppStore, user: AuthUser | undefined, query: ProductKeyQuery) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const productId = query['productId'] as string | undefined;
  const targetIds = productId ? [productId] : ctx.productIds;
  if (!targetIds.length) return { data: [] };
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(productKeys).where(inArray(productKeys.productId, targetIds))
      : await store.db
          .select()
          .from(productKeys)
          .where(inArray(productKeys.productId, targetIds));
  return {
    data: rows.map((r: ProductKeyRow) => ({
      ...r,
      secret: undefined,
      masked: maskApiKey(r.id)
    }))
  };
};

export const createProductKey = async (env: Bindings, store: AppStore, user: AuthUser | undefined, body: { productId: string; name?: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  if (!body.productId) return new Response('productId required', { status: 400 });
  const product = await assertProductAccessible(store, ctx, body.productId);
  const { id, secret, apiKey } = createApiKeyValue();
  const now = new Date().toISOString();
  await store.db
    .insert(productKeys)
    .values({ id, productId: product.id, name: body.name ?? null, secret, createdAt: now, revoked: false })
    .run();
  return { ok: true, id, productId: product.id, apiKey };
};

export const rotateProductKey = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const existing = await store.db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  await assertProductAccessible(store, ctx, existing.productId);
  const { secret, apiKey } = createApiKeyValue();
  const now = new Date().toISOString();
  await store.db.update(productKeys).set({ secret, createdAt: now, lastUsedAt: null, revoked: false }).where(eq(productKeys.id, id)).run();
  return { ok: true, id: existing.id, apiKey };
};

export const revokeProductKey = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string, body: { revoked?: boolean }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const existing = await store.db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  await assertProductAccessible(store, ctx, existing.productId);
  await store.db.update(productKeys).set({ revoked: body.revoked ?? true }).where(eq(productKeys.id, id)).run();
  return { ok: true };
};
