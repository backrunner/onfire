import { TicketPriority, TicketStatus } from '@onfire/shared';
import type { Db } from '@onfire/shared/drizzle/client';
import { agents, agentTeams, tickets, users } from '@onfire/shared/drizzle/schema';
import { and, eq, inArray } from 'drizzle-orm';

const CACHE_TTL_MS = 30_000;
type LoadEntry = { counts: Map<string, number>; ts: number };
const loadCache = new Map<string, LoadEntry>();

const cacheKey = (teamId: string) => `team:${teamId}`;
const isFresh = (entry?: LoadEntry) => entry && Date.now() - entry.ts < CACHE_TTL_MS;

export const getTeamAgents = async (db: Db, teamId: string) => {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, level: agents.level })
    .from(agentTeams)
    .leftJoin(users, eq(agentTeams.userId, users.id))
    .leftJoin(agents, eq(agentTeams.userId, agents.userId))
    .where(and(eq(agentTeams.teamId, teamId), eq(agents.active, true)));
  return rows ?? [];
};

export const getLoad = async (db: Db, teamId: string) => {
  const key = cacheKey(teamId);
  const cached = loadCache.get(key);
  if (isFresh(cached)) return cached.counts;

  const rows = await db
    .select({ assigneeId: tickets.assigneeId })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), inArray(tickets.status, openStatuses)))
    .groupBy(tickets.assigneeId);

  const map = new Map<string, number>();
  (rows ?? []).forEach((row) => {
    if (row.assigneeId) map.set(row.assigneeId, (map.get(row.assigneeId) ?? 0) + 1);
  });
  loadCache.set(key, { counts: map, ts: Date.now() });
  return map;
};

export const bumpLoadCache = (teamId: string, assigneeId: string | null) => {
  const cached = loadCache.get(cacheKey(teamId));
  if (!cached || !isFresh(cached) || !assigneeId) return;
  cached.counts.set(assigneeId, (cached.counts.get(assigneeId) ?? 0) + 1);
  cached.ts = Date.now();
};

export const pickAssignee = async (db: Db, teamId: string, minLevel = 1) => {
  const agents = await getTeamAgents(db, teamId);
  const load = await getLoad(db, teamId);
  const candidates = agents.filter((a) => a.level >= minLevel);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const la = load.get(a.id) ?? 0;
    const lb = load.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    return b.level - a.level; // 同负载优先高等级
  });
  return candidates[0];
};

export const chooseEscalationAssignee = async (db: Db, teamId: string, currentAssignee?: string | null) => {
  let minLevel = 1;
  if (currentAssignee) {
    const levelRow = await db.select({ level: agents.level }).from(agents).where(eq(agents.userId, currentAssignee)).get();
    minLevel = (levelRow?.level ?? 1) + 1;
  }
  return pickAssignee(db, teamId, minLevel);
};

export const derivePriority = (customerLevel?: number): TicketPriority => {
  if (customerLevel !== undefined && customerLevel >= 90) return TicketPriority.High;
  if (customerLevel !== undefined && customerLevel >= 70) return TicketPriority.Medium;
  return TicketPriority.Medium;
};

export const openStatuses = [TicketStatus.New, TicketStatus.Processing, TicketStatus.Replied, TicketStatus.Escalated];
