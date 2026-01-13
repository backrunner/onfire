import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { agents, users, agentTeams } from '@onfire/shared/drizzle/schema';
import { eq } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { loadAgents, assertTeamIdsAccessible, upsertAgentProfile } from '../utils';
import { ok } from '../../../core/response';

type AgentTeamRow = typeof agentTeams.$inferSelect;

export const agentRoutes = () => {
  const router = createRouter();

  // GET /agents
  router.get('/agents', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'user.manage');

    const data = await loadAgents(db, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    return c.json(ok({ data }));
  });

  // PATCH /agents/:id
  router.patch('/agents/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'agent.profile');

    const id = c.req.param('id');
    const body = await c.req.json<{ level?: number; active?: boolean; teamIds?: string[]; displayName?: string; email?: string; avatarUrl?: string }>();

    const targetUser = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!targetUser) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(targetUser.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    const isSelf = ctx.user.id === id;
    const isRestrictedField = body.level !== undefined || body.active !== undefined || body.teamIds !== undefined;

    if (ctx.user.role === Role.Agent) {
      if (!isSelf) {
        return handleResult(c, errorResult(403, 'forbidden'));
      }
      if (isRestrictedField) {
        return handleResult(c, errorResult(403, 'forbidden: cannot modify level, active, or teamIds'));
      }
    } else if (ctx.user.role === Role.TeamAdmin) {
      if (!isSelf) {
        const targetTeamRows: AgentTeamRow[] = await db.select().from(agentTeams).where(eq(agentTeams.userId, id));
        const targetTeamIds = targetTeamRows.map((r: AgentTeamRow) => r.teamId);
        const hasSharedTeam = ctx.teamIds.some((t: string) => targetTeamIds.includes(t));
        if (!hasSharedTeam) {
          return handleResult(c, errorResult(403, 'forbidden'));
        }
      }
    }

    if (body.teamIds) {
      await assertTeamIdsAccessible(db, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
      await db.delete(agentTeams).where(eq(agentTeams.userId, id)).run();
      if (body.teamIds.length) {
        await db.insert(agentTeams).values(body.teamIds.map((t) => ({ userId: id, teamId: t }))).run();
      }
    }
    if (body.level !== undefined || body.active !== undefined) {
      await db
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
      await upsertAgentProfile(db, id, { displayName: body.displayName, email: body.email, avatarUrl: body.avatarUrl });
    }

    const refreshed = await loadAgents(db, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    return c.json(ok({ ok: true, data: refreshed }));
  });

  return router;
};
