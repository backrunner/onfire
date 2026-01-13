import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { categoryRoutes } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';
import { assertProductAccessible, assertTeamIdsAccessible } from '../utils';

type CategoryRouteQuery = Record<string, string | undefined>;

export const listCategoryRoutes = async (env: Bindings, store: AppStore, user: AuthUser | undefined, query: CategoryRouteQuery) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'category.map');
  const productId = (query['productId'] as string | undefined) ?? undefined;
  const targetProductIds = productId ? [productId] : ctx.productIds;
  if (!targetProductIds.length) return { data: [] };
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds))
      : await store.db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds));
  return { data: rows };
};

export const createCategoryRoute = async (env: Bindings, store: AppStore, user: AuthUser | undefined, body: { productId: string; category: string; subcategory?: string; teamId: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'category.map');
  if (!body.productId || !body.category || !body.teamId) return new Response('productId, category, teamId required', { status: 400 });
  await assertProductAccessible(store, ctx, body.productId);
  await assertTeamIdsAccessible(store, [body.teamId], ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  const id = crypto.randomUUID();
  await store.db
    .insert(categoryRoutes)
    .values({ id, productId: body.productId, category: body.category, subcategory: body.subcategory ?? null, teamId: body.teamId })
    .run();
  return { ok: true, id };
};

export const updateCategoryRoute = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string, body: { category?: string; subcategory?: string | null; teamId?: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'category.map');
  const existing = await store.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  await assertProductAccessible(store, ctx, existing.productId);
  if (!body.category && body.subcategory === undefined && !body.teamId) return new Response('payload required', { status: 400 });
  if (body.teamId) {
    await assertTeamIdsAccessible(store, [body.teamId], ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  }
  await store.db
    .update(categoryRoutes)
    .set({
      ...(body.category ? { category: body.category } : {}),
      ...(body.subcategory !== undefined ? { subcategory: body.subcategory } : {}),
      ...(body.teamId ? { teamId: body.teamId } : {})
    })
    .where(eq(categoryRoutes.id, id))
    .run();
  return { ok: true };
};

export const deleteCategoryRoute = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'category.map');
  const existing = await store.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  await assertProductAccessible(store, ctx, existing.productId);
  await store.db.delete(categoryRoutes).where(eq(categoryRoutes.id, id)).run();
  return { ok: true };
};
