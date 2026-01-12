import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { users } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { Bindings } from '../../../core/types';

export const listUsers = async (env: Bindings, store: any, user: any) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'user.manage');
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(users)
      : await store.db.select().from(users).where(inArray(users.tenantId, ctx.tenantIds));
  return { data: rows };
};

export const updateUser = async (env: Bindings, store: any, user: any, id: string, body: { role?: Role; displayName?: string; tenantId?: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'role.manage');
  const target = await store.db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(target.tenantId as any)) return new Response('forbidden', { status: 403 });
  const updates: any = {};
  if (body.role) updates.role = body.role;
  if (body.displayName) updates.displayName = body.displayName;
  if (body.tenantId) {
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(body.tenantId as any)) return new Response('forbidden', { status: 403 });
    updates.tenantId = body.tenantId;
  }
  if (!Object.keys(updates).length) return new Response('payload required', { status: 400 });
  await store.db.update(users).set(updates).where(eq(users.id, id)).run();
  return { ok: true };
};
