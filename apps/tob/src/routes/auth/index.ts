import { Role } from '@onfire/shared';
import { agentTeams, agents, teams, tenants, users } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../core/router';
import { handleResult, errorResult } from '../../core/route-utils';
import { readInstallState } from '../../core/install';
import { ok } from '../../core/response';

export const authRoutes = () => {
  const router = createRouter();

  // Note: Better Auth routes (/auth/sign-in/email, /auth/sign-up/email, etc.)
  // are mounted directly in index.ts using app.on(['POST', 'GET'], '/api/tob/auth/*')
  // This file only contains custom auth-related routes

  // GET /install/status
  router.get('/install/status', async (c) => {
    const db = c.get('db');
    const state = await readInstallState(db);
    return c.json(ok({ needsSetup: !state.hasUser, hasTenant: state.hasTenant }));
  });

  // POST /install/finalize
  router.post('/install/finalize', async (c) => {
    const body = await c.req.json<{ tenantName?: string; displayName?: string }>();
    const db = c.get('db');
    const auth = c.get('auth');

    const state = await readInstallState(db);
    if (state.hasUser) {
      return handleResult(c, errorResult(400, 'already-installed'));
    }

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id || !session?.user?.email) {
      return handleResult(c, errorResult(401, 'unauthorized'));
    }

    if (!body.tenantName) {
      return handleResult(c, errorResult(400, 'tenantName required'));
    }

    const tenantId = crypto.randomUUID();
    const defaultTeamId = crypto.randomUUID();
    const displayName = body.displayName?.trim() || session.user.email.split('@')[0] || 'Super Admin';

    await db.insert(tenants).values({ id: tenantId, name: body.tenantName, defaultTeamId }).run();
    await db.insert(teams).values({ id: defaultTeamId, tenantId, name: '默认团队', allowReassign: true }).run();
    await db.insert(users).values({ id: session.user.id, email: session.user.email, displayName, tenantId, role: Role.SuperAdmin }).run();
    await db.insert(agents).values({ userId: session.user.id, level: 1, active: true }).onConflictDoNothing();
    await db.insert(agentTeams).values({ userId: session.user.id, teamId: defaultTeamId }).onConflictDoNothing();

    return c.json(ok({ ok: true, tenantId, teamId: defaultTeamId, userId: session.user.id }));
  });

  return router;
};
