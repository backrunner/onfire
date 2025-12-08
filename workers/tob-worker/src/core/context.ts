import type { SessionContext, TenantID, ProductID, TeamID } from '@onfire/shared';
import { Role } from '@onfire/shared';
import { createDb } from '@onfire/shared/drizzle/client';
import { agentTeams, agents, productTeams, users } from '@onfire/shared/drizzle/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { Bindings } from './types';

export interface AuthUser {
  id?: string;
  email?: string;
  role?: Role | string;
}

const DEFAULT_TENANT = 'demo-tenant';
const DEFAULT_TEAM = 'team-default';

const ensureUserProvisioned = async (env: Bindings, user: AuthUser, db = createDb(env.DB)) => {
  if (!user.id || !user.email) return;
  const existing = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (existing) return;

  await db.insert(users).values({
    id: user.id,
    email: user.email,
    displayName: user.email.split('@')[0] ?? 'User',
    tenantId: DEFAULT_TENANT,
    role: (user.role as Role) ?? Role.Agent
  });
  await db.insert(agents).values({ userId: user.id, level: 1, active: true }).onConflictDoNothing();
  await db.insert(agentTeams).values({ userId: user.id, teamId: DEFAULT_TEAM }).onConflictDoNothing();
};

export const resolveContext = async (env: Bindings, user: AuthUser | undefined): Promise<SessionContext> => {
  if (!user?.id) {
    throw new Response('unauthorized', { status: 401 });
  }

  const db = createDb(env.DB);
  await ensureUserProvisioned(env, user, db);

  const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!dbUser) throw new Response('unauthorized', { status: 401 });

  const role = (dbUser.role as Role) ?? Role.Agent;
  const userTeams = await db.select({ teamId: agentTeams.teamId }).from(agentTeams).where(eq(agentTeams.userId, dbUser.id));
  const teamIds: TeamID[] = userTeams.map((t) => t.teamId as TeamID);

  const teamProducts =
    teamIds.length > 0
      ? await db.select({ productId: productTeams.productId }).from(productTeams).where(inArray(productTeams.teamId, teamIds))
      : [];
  const productIds: ProductID[] = teamProducts.map((p) => p.productId as ProductID);

  const tenantId = dbUser.tenantId as TenantID;
  const agentRow = await db.query.agents.findFirst({ where: eq(agents.userId, dbUser.id) });

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.displayName,
      tenantId,
      role,
      teamIds
    },
    agent: agentRow
      ? {
          userId: agentRow.userId,
          level: agentRow.level ?? 1,
          displayName: dbUser.displayName,
          email: dbUser.email,
          teamIds,
          active: Boolean(agentRow.active)
        }
      : undefined,
    tenantIds: [tenantId],
    productIds,
    teamIds
  };
};
