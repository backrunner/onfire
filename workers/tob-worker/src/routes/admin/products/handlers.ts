import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { products, productTeams } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';
import { slaColumnsFromPayload, syncProductTeams, type ProductSlaInput } from '../utils';

type ProductRow = typeof products.$inferSelect;
type ProductTeamRow = typeof productTeams.$inferSelect;

export const listProducts = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(products)
      : await store.db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
  const ids = rows.map((p: ProductRow) => p.id);
  const bindings = ids.length
    ? await store.db.select().from(productTeams).where(inArray(productTeams.productId, ids))
    : [];
  const teamMap = new Map<string, string[]>();
  bindings.forEach((b: ProductTeamRow) => {
    teamMap.set(b.productId, [...(teamMap.get(b.productId) ?? []), b.teamId]);
  });
  const merged = rows.map((p: ProductRow) => ({ ...p, teamIds: teamMap.get(p.id) ?? [] }));
  return { data: merged };
};

export const createProduct = async (env: Bindings, store: AppStore, user: AuthUser | undefined, body: { name: string; tenantId?: string; sla?: ProductSlaInput; teamIds?: string[] }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  if (!body.name) return new Response('name required', { status: 400 });
  const tenantId = body.tenantId ?? ctx.tenantIds[0];
  if (!tenantId) return new Response('tenantId required', { status: 400 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(tenantId as string)) return new Response('forbidden', { status: 403 });
  const id = crypto.randomUUID();
  await store.db
    .insert(products)
    .values({
      id,
      tenantId,
      name: body.name,
      ...slaColumnsFromPayload(body.sla)
    })
    .run();
  if (body.teamIds && body.teamIds.length) {
    await syncProductTeams(store, id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  }
  return { ok: true, id };
};

export const updateProduct = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string, body: { name?: string; sla?: ProductSlaInput; teamIds?: string[] }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) return new Response('forbidden', { status: 403 });
  const updates = {
    ...(body.name ? { name: body.name } : {}),
    ...slaColumnsFromPayload(body.sla)
  };
  if (!Object.keys(updates).length && !body.teamIds) return new Response('payload required', { status: 400 });
  if (Object.keys(updates).length) {
    await store.db.update(products).set(updates).where(eq(products.id, id)).run();
  }
  if (body.teamIds) {
    await syncProductTeams(store, id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  }
  return { ok: true };
};

export const deleteProduct = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'product.manage');
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) return new Response('forbidden', { status: 403 });
  await store.db.delete(products).where(eq(products.id, id)).run();
  return { ok: true };
};
