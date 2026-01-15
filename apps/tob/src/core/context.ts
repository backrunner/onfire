import type { SessionContext, TenantID, ProductID, TeamID } from '@onfire/shared';
import { Role } from '@onfire/shared';
import { createDb } from '@onfire/shared/drizzle/client';
import { agentTeams, agents, productTeams, users, tenants, teams, products } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import type { AuthUser, Bindings } from './types';
import { assertInstalled } from './install';

export const resolveContext = async (env: Bindings, user: AuthUser | undefined): Promise<SessionContext> => {
  if (!user?.id) {
    throw new Response('unauthorized', { status: 401 });
  }

  const db = createDb(env.DB);
  await assertInstalled(env.DB);
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!dbUser) throw new Response('unauthorized', { status: 401 });

  const role = (dbUser.role as Role) ?? Role.Agent;
  const tenantId = dbUser.tenantId as TenantID;
  const agentRow = await db.query.agents.findFirst({ where: eq(agents.userId, dbUser.id) });

  const isSuperAdmin = role === Role.SuperAdmin;
  const userTeams = await db.select({ teamId: agentTeams.teamId }).from(agentTeams).where(eq(agentTeams.userId, dbUser.id));
  let teamIds: TeamID[] = userTeams.map((t) => t.teamId as TeamID);

  let tenantIds: TenantID[] = [tenantId];
  let productIds: ProductID[] = [];

  if (isSuperAdmin) {
    tenantIds = (await db.select({ id: tenants.id }).from(tenants)).map((t) => t.id as TenantID);
    teamIds = (await db.select({ id: teams.id }).from(teams)).map((t) => t.id as TeamID);
    productIds = (await db.select({ id: products.id }).from(products)).map((p) => p.id as ProductID);
  } else {
    if ([Role.TenantAdmin, Role.ProductAdmin].includes(role)) {
      const productsByTenant = await db.select({ id: products.id }).from(products).where(inArray(products.tenantId, tenantIds));
      productIds = productsByTenant.map((p) => p.id as ProductID);
    } else if (teamIds.length > 0) {
      const teamProducts =
        teamIds.length > 0
          ? await db.select({ productId: productTeams.productId }).from(productTeams).where(inArray(productTeams.teamId, teamIds))
          : [];
      productIds = teamProducts.map((p) => p.productId as ProductID);
    }
  }

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
    tenantIds,
    productIds,
    teamIds
  };
};
