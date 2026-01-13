import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { agents, users, agentTeams } from '@onfire/shared/drizzle/schema';
import { eq } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';
import { loadAgents, assertTeamIdsAccessible, upsertAgentProfile } from '../utils';

type AgentTeamRow = typeof agentTeams.$inferSelect;

export const listAgents = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'user.manage');
  const data = await loadAgents(store, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  return { data };
};

export const updateAgent = async (
  env: Bindings,
  store: AppStore,
  user: AuthUser | undefined,
  id: string,
  body: { level?: number; active?: boolean; teamIds?: string[]; displayName?: string; email?: string; avatarUrl?: string }
) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'agent.profile');
  const targetUser = await store.db.query.users.findFirst({ where: eq(users.id, id) });
  if (!targetUser) return new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(targetUser.tenantId as string)) return new Response('forbidden', { status: 403 });

  const isSelf = ctx.user.id === id;
  const isRestrictedField = body.level !== undefined || body.active !== undefined || body.teamIds !== undefined;

  if (ctx.user.role === Role.Agent) {
    if (!isSelf) return new Response('forbidden', { status: 403 });
    if (isRestrictedField) return new Response('forbidden: cannot modify level, active, or teamIds', { status: 403 });
  } else if (ctx.user.role === Role.TeamAdmin) {
    if (!isSelf) {
      const targetTeamRows: AgentTeamRow[] = await store.db.select().from(agentTeams).where(eq(agentTeams.userId, id));
      const targetTeamIds = targetTeamRows.map((r: AgentTeamRow) => r.teamId);
      const hasSharedTeam = ctx.teamIds.some((t: string) => targetTeamIds.includes(t));
      if (!hasSharedTeam) return new Response('forbidden', { status: 403 });
    }
  }

  if (body.teamIds) {
    await assertTeamIdsAccessible(store, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    await store.db.delete(agentTeams).where(eq(agentTeams.userId, id)).run();
    if (body.teamIds.length) {
      await store.db.insert(agentTeams).values(body.teamIds.map((t) => ({ userId: id, teamId: t }))).run();
    }
  }
  if (body.level !== undefined || body.active !== undefined) {
    await store.db
      .insert(agents)
      .values({ userId: id, level: body.level ?? 1, active: body.active ?? true })
      .onConflictDoUpdate({
        target: agents.userId,
        set: {
          ...(body.level !== undefined ? { level: body.level } : {}),
          ...(body.active !== undefined ? { active: body.active } : {})
        }
      })
      .run();
  }
  if (body.displayName || body.email || body.avatarUrl !== undefined) {
    await upsertAgentProfile(store, id, { displayName: body.displayName, email: body.email, avatarUrl: body.avatarUrl });
  }
  const refreshed = await loadAgents(store, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
  return { ok: true, data: refreshed };
};
