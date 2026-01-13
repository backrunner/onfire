import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { teams } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';

export const listTeams = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'team.manage');
  const rows =
    ctx.user.role === Role.SuperAdmin
      ? await store.db.select().from(teams)
      : await store.db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
  return { data: rows };
};

export const createTeam = async (env: Bindings, store: AppStore, user: AuthUser | undefined, body: { name: string; allowReassign?: boolean; tenantId?: string }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'team.manage');
  if (!body.name) return new Response('name required', { status: 400 });
  const tenantId = body.tenantId ?? ctx.tenantIds[0];
  if (!tenantId) return new Response('tenantId required', { status: 400 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(tenantId as string)) return new Response('forbidden', { status: 403 });
  const id = crypto.randomUUID();
  await store.db.insert(teams).values({ id, tenantId, name: body.name, allowReassign: body.allowReassign ?? true }).run();
  return { ok: true, id };
};

export const updateTeam = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string, body: { name?: string; allowReassign?: boolean }) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'team.manage');
  const existing = await store.db.query.teams.findFirst({ where: eq(teams.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) return new Response('forbidden', { status: 403 });
  await store.db
    .update(teams)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(body.allowReassign === undefined ? {} : { allowReassign: body.allowReassign })
    })
    .where(eq(teams.id, id))
    .run();
  return { ok: true };
};

export const deleteTeam = async (env: Bindings, store: AppStore, user: AuthUser | undefined, id: string) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'team.manage');
  const existing = await store.db.query.teams.findFirst({ where: eq(teams.id, id) });
  if (!existing) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) return new Response('forbidden', { status: 403 });
  await store.db.delete(teams).where(eq(teams.id, id)).run();
  return { ok: true };
};
