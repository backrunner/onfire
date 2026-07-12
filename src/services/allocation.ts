import { TicketPriority, TicketStatus } from "@/lib/types";
import type { Database } from "@/lib/db";
import { agents, agentTeams, tickets, users } from "@/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

export const openStatuses = [
  TicketStatus.New,
  TicketStatus.Processing,
  TicketStatus.Replied,
  TicketStatus.Escalated,
];

export const getTeamAgents = async (db: Database, teamId: string) => {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      level: agents.level,
    })
    .from(agentTeams)
    .leftJoin(users, eq(agentTeams.userId, users.id))
    .leftJoin(agents, eq(agentTeams.userId, agents.userId))
    .where(and(eq(agentTeams.teamId, teamId), eq(agents.active, true)));
  return rows ?? [];
};

export const getLoad = async (db: Database, teamId: string) => {
  const rows = await db
    .select({ assigneeId: tickets.assigneeId })
    .from(tickets)
    .where(and(eq(tickets.teamId, teamId), inArray(tickets.status, openStatuses)));

  const map = new Map<string, number>();
  (rows ?? []).forEach((row) => {
    if (row.assigneeId)
      map.set(row.assigneeId, (map.get(row.assigneeId) ?? 0) + 1);
  });
  return map;
};

export const pickAssignee = async (
  db: Database,
  teamId: string,
  minLevel = 1
) => {
  const teamAgents = await getTeamAgents(db, teamId);
  const load = await getLoad(db, teamId);
  const normalized = teamAgents
    .filter((a): a is typeof a & { id: string } => Boolean(a.id))
    .map((a) => ({ ...a, id: a.id, level: a.level ?? 1 }));
  const candidates = normalized.filter((a) => a.level >= minLevel);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const la = load.get(a.id) ?? 0;
    const lb = load.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    return b.level - a.level;
  });
  return candidates[0];
};

export const chooseEscalationAssignee = async (
  db: Database,
  teamId: string,
  currentAssignee?: string | null
) => {
  let minLevel = 1;
  if (currentAssignee) {
    const levelRow = await db
      .select({ level: agents.level })
      .from(agents)
      .where(eq(agents.userId, currentAssignee))
      .get();
    minLevel = (levelRow?.level ?? 1) + 1;
  }
  return pickAssignee(db, teamId, minLevel);
};

export const derivePriority = (customerLevel?: number): TicketPriority => {
  if (customerLevel !== undefined && customerLevel >= 90)
    return TicketPriority.High;
  if (customerLevel !== undefined && customerLevel >= 70)
    return TicketPriority.Medium;
  return TicketPriority.Medium;
};
