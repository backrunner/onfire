import { Role } from '@onfire/shared';
import { agentTeams, agents, teams, tenants, users } from '@onfire/shared/drizzle/schema';
import { readInstallState } from '../../core/install';
import type { Auth } from 'better-auth';
import type { AppStore } from '../../core/types';

export const changePassword = async (auth: Auth, request: Request, body: { currentPassword?: string; newPassword?: string; revokeOtherSessions?: boolean }) => {
  if (!body.currentPassword || !body.newPassword) {
    return new Response('currentPassword and newPassword required', { status: 400 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response('unauthorized', { status: 401 });

  try {
    await auth.api.changePassword({
      headers: request.headers,
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: body.revokeOtherSessions ?? true
      }
    });
    return { ok: true };
  } catch (err) {
    console.error('changePassword failed', err);
    return new Response('change-password failed', { status: 400 });
  }
};

export const getInstallStatus = async (store: AppStore) => {
  const state = await readInstallState(store.db);
  return { needsSetup: !state.hasUser, hasTenant: state.hasTenant };
};

export const finalizeInstall = async (
  store: AppStore,
  auth: Auth,
  request: Request,
  body: { tenantName?: string; displayName?: string }
) => {
  const state = await readInstallState(store.db);
  if (state.hasUser) return new Response('already-installed', { status: 400 });

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id || !session?.user?.email) return new Response('unauthorized', { status: 401 });

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
};
