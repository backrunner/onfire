/**
 * Shared utilities for admin routes
 */
import { Role, type SessionContext } from '@onfire/shared';
import { teams, products, productTeams, agents, users, agentTeams, agentProfiles } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import type { AppStore } from '../../core/types';

type TeamRow = typeof teams.$inferSelect;
type AgentTeamRow = typeof agentTeams.$inferSelect;

export type ProductSlaInput = {
  highAccept?: number;
  highReply?: number;
  mediumAccept?: number;
  mediumReply?: number;
  lowAccept?: number;
  lowReply?: number;
};

export const slaColumnsFromPayload = (sla?: ProductSlaInput) =>
  sla
    ? {
        ...(sla.highAccept !== undefined ? { slaHighAccept: sla.highAccept } : {}),
        ...(sla.highReply !== undefined ? { slaHighReply: sla.highReply } : {}),
        ...(sla.mediumAccept !== undefined ? { slaMediumAccept: sla.mediumAccept } : {}),
        ...(sla.mediumReply !== undefined ? { slaMediumReply: sla.mediumReply } : {}),
        ...(sla.lowAccept !== undefined ? { slaLowAccept: sla.lowAccept } : {}),
        ...(sla.lowReply !== undefined ? { slaLowReply: sla.lowReply } : {})
      }
    : {};

export const syncProductTeams = async (store: AppStore, productId: string, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds) return;
  if (!isSuperAdmin) {
    const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
    const invalid = rows.filter((t: TeamRow) => !allowedTenantIds.includes(t.tenantId));
    if (invalid.length) throw new Response('forbidden', { status: 403 });
  }
  await store.db.delete(productTeams).where(eq(productTeams.productId, productId)).run();
  if (teamIds.length === 0) return;
  await store.db
    .insert(productTeams)
    .values(teamIds.map((tid) => ({ productId, teamId: tid })))
    .run();
};

export const createApiKeyValue = () => {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  return { id, secret, apiKey: `${id}.${secret}` };
};

export const maskApiKey = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

export const assertTeamIdsAccessible = async (store: AppStore, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds?.length) return;
  if (isSuperAdmin) return;
  const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
  const invalid = rows.filter((t: TeamRow) => !allowedTenantIds.includes(t.tenantId));
  if (invalid.length) throw new Response('forbidden', { status: 403 });
};

interface AgentJoinRow {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  tenantId: string | null;
  role: string | null;
  level: number | null;
  active: number | boolean | null;
  profileName: string | null;
  profileEmail: string | null;
  avatarUrl: string | null;
}

export const loadAgents = async (store: AppStore, tenantIds: string[], isSuperAdmin: boolean) => {
  const baseSelect = {
    userId: users.id,
    email: users.email,
    displayName: users.displayName,
    tenantId: users.tenantId,
    role: users.role,
    level: agents.level,
    active: agents.active,
    profileName: agentProfiles.displayName,
    profileEmail: agentProfiles.email,
    avatarUrl: agentProfiles.avatarUrl
  };
  const joined: AgentJoinRow[] =
    isSuperAdmin
      ? await store.db.select(baseSelect).from(agents).leftJoin(users, eq(users.id, agents.userId)).leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
      : await store.db
          .select(baseSelect)
          .from(agents)
          .leftJoin(users, eq(users.id, agents.userId))
          .leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
          .where(inArray(users.tenantId, tenantIds));

  const ids = joined.map((a: AgentJoinRow) => a.userId).filter((id): id is string => id !== null);
  const teamRows: AgentTeamRow[] = ids.length
    ? await store.db.select({ userId: agentTeams.userId, teamId: agentTeams.teamId }).from(agentTeams).where(inArray(agentTeams.userId, ids))
    : [];
  const teamMap = new Map<string, string[]>();
  teamRows.forEach((r: AgentTeamRow) => teamMap.set(r.userId, [...(teamMap.get(r.userId) ?? []), r.teamId]));

  return joined.map((a: AgentJoinRow) => ({
    userId: a.userId ?? '',
    email: a.profileEmail ?? a.email,
    displayName: a.profileName ?? a.displayName,
    tenantId: a.tenantId,
    role: a.role,
    level: a.level ?? 1,
    active: Boolean(a.active ?? true),
    teamIds: (a.userId ? teamMap.get(a.userId) : undefined) ?? [],
    avatarUrl: a.avatarUrl ?? undefined
  }));
};

export const upsertAgentProfile = async (store: AppStore, userId: string, profile?: { displayName?: string; email?: string; avatarUrl?: string }) => {
  if (!profile) return;
  const baseUser = await store.db.query.users.findFirst({ where: eq(users.id, userId) });
  const payload = {
    userId,
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {})
  };
  if (Object.keys(payload).length <= 1 && !profile.avatarUrl) return;
  const displayName = payload.displayName ?? baseUser?.displayName ?? 'Agent';
  const email = payload.email ?? baseUser?.email ?? 'unknown@agent';
  await store.db
    .insert(agentProfiles)
    .values({ userId, displayName, email, avatarUrl: profile.avatarUrl ?? null })
    .onConflictDoUpdate({
      target: agentProfiles.userId,
      set: {
        ...(profile.displayName ? { displayName: profile.displayName } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {})
      }
    })
    .run();
};

export const parseJsonSafe = (val: string | null) => {
  if (!val) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
};

export const assertProductAccessible = async (store: AppStore, ctx: SessionContext, productId: string) => {
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!existing) throw new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) throw new Response('forbidden', { status: 403 });
  return existing;
};
