import { Role } from '@onfire/shared';
import { agentTeams, agents, teams, tenants, users } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { readInstallState } from '../core/install';
import type { Bindings, WorkerSingleton } from '../core/types';

export const createInstallRoutes = (env: Bindings, auth: any) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/install' })
    .get('/status', async ({ store }) => {
      const state = await readInstallState(store.db);
      return { needsSetup: !state.hasUser, hasTenant: state.hasTenant };
    })
    .post('/finalize', async ({ store, request }) => {
      const state = await readInstallState(store.db);
      if (state.hasUser) return new Response('already-installed', { status: 400 });

      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user?.id || !session?.user?.email) return new Response('unauthorized', { status: 401 });

      const body = (await request.json().catch(() => ({}))) as { tenantName?: string; displayName?: string };
      if (!body.tenantName) return new Response('tenantName required', { status: 400 });

      const tenantId = crypto.randomUUID();
      const defaultTeamId = crypto.randomUUID();
      const displayName = body.displayName?.trim() || session.user.email.split('@')[0] || 'Super Admin';

      await store.db.insert(tenants).values({ id: tenantId, name: body.tenantName, defaultTeamId }).run();
      await store.db.insert(teams).values({ id: defaultTeamId, tenantId, name: '默认团队', allowReassign: true }).run();
      await store.db.insert(users).values({ id: session.user.id, email: session.user.email, displayName, tenantId, role: Role.SuperAdmin }).run();
      await store.db.insert(agents).values({ userId: session.user.id, level: 1, active: true }).onConflictDoNothing();
      await store.db.insert(agentTeams).values({ userId: session.user.id, teamId: defaultTeamId }).onConflictDoNothing();

      return { ok: true, tenantId, teamId: defaultTeamId, userId: session.user.id };
    });
