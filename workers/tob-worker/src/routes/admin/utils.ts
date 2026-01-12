/**
 * Shared utilities for admin routes
 */
import { Role } from '@onfire/shared';
import { teams, products, productTeams, agents, users, agentTeams, agentProfiles } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';

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

export const syncProductTeams = async (store: any, productId: string, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds) return;
  if (!isSuperAdmin) {
    const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
    const invalid = rows.filter((t: any) => !allowedTenantIds.includes(t.tenantId));
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

export const assertTeamIdsAccessible = async (store: any, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds?.length) return;
  if (isSuperAdmin) return;
  const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
  const invalid = rows.filter((t: any) => !allowedTenantIds.includes(t.tenantId));
  if (invalid.length) throw new Response('forbidden', { status: 403 });
};

export const loadAgents = async (store: any, tenantIds: string[], isSuperAdmin: boolean) => {
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
  const joined =
    isSuperAdmin
      ? await store.db.select(baseSelect).from(agents).leftJoin(users, eq(users.id, agents.userId)).leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
      : await store.db
          .select(baseSelect)
          .from(agents)
          .leftJoin(users, eq(users.id, agents.userId))
          .leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
          .where(inArray(users.tenantId, tenantIds));

  const ids = joined.map((a: any) => a.userId).filter(Boolean);
  const teamRows = ids.length
    ? await store.db.select({ userId: agentTeams.userId, teamId: agentTeams.teamId }).from(agentTeams).where(inArray(agentTeams.userId, ids))
    : [];
  const teamMap = new Map<string, string[]>();
  teamRows.forEach((r: any) => teamMap.set(r.userId, [...(teamMap.get(r.userId) ?? []), r.teamId]));

  return joined.map((a: any) => ({
    userId: a.userId,
    email: a.profileEmail ?? a.email,
    displayName: a.profileName ?? a.displayName,
    tenantId: a.tenantId,
    role: a.role,
    level: a.level ?? 1,
    active: Boolean(a.active ?? true),
    teamIds: teamMap.get(a.userId) ?? [],
    avatarUrl: a.avatarUrl ?? undefined
  }));
};

export const upsertAgentProfile = async (store: any, userId: string, profile?: { displayName?: string; email?: string; avatarUrl?: string }) => {
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

export const assertProductAccessible = async (store: any, ctx: any, productId: string) => {
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!existing) throw new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) throw new Response('forbidden', { status: 403 });
  return existing;
};
