import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { tenants } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';

export const listTenants = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(tenants)
      : await store.db.select().from(tenants).where(inArray(tenants.id, ctx.tenantIds));
  return { data: rows };
};

export const createTenant = async (env: Bindings, store: AppStore, user: AuthUser | undefined, body: { name: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');
  if (!body.name) return new Response('name required', { status: 400 });
  const id = crypto.randomUUID();
  await store.db.insert(tenants).values({ id, name: body.name }).run();
  return { ok: true, id };
};

export const updateTenant = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string, body: { name?: string }) => {
  const ctx = await resolveContext(env, user);
  const existing = await store.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  assertPermission(ctx, 'tenant.manage', { tenantId: existing.id });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.id as string)) {
    return new Response('forbidden', { status: 403 });
  }
  if (!body.name) return new Response('name required', { status: 400 });
  await store.db.update(tenants).set({ name: body.name }).where(eq(tenants.id, id)).run();
  return { ok: true };
};

export const deleteTenant = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string) => {
  const ctx = await resolveContext(env, user);
  const existing = await store.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  assertPermission(ctx, 'tenant.manage', { tenantId: existing.id });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.id as string)) {
    return new Response('forbidden', { status: 403 });
  }
  await store.db.delete(tenants).where(eq(tenants.id, id)).run();
  return { ok: true };
};
