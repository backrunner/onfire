import { inArray } from "drizzle-orm";
import { users, agentProfiles, customers } from "@/drizzle/schema";
import type { Database } from "@/lib/db";

/**
 * Resolve user IDs to display names (users table first, agent profile as
 * fallback for agent-only personas). Unknown IDs are simply absent.
 */
export async function resolveUserNames(
  db: Database,
  ids: Array<string | null | undefined>
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};

  const [userRows, profileRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(inArray(users.id, unique)),
    db
      .select({ id: agentProfiles.userId, name: agentProfiles.displayName })
      .from(agentProfiles)
      .where(inArray(agentProfiles.userId, unique)),
  ]);

  const map: Record<string, string> = {};
  for (const row of profileRows) map[row.id] = row.name;
  for (const row of userRows) map[row.id] = row.name;
  return map;
}

/**
 * Resolve customer IDs to their business-product external IDs, used as the
 * display identity for customers that have no email on file.
 */
export async function resolveCustomerExternalIds(
  db: Database,
  ids: Array<string | null | undefined>
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};

  const rows = await db
    .select({ id: customers.id, externalId: customers.externalId })
    .from(customers)
    .where(inArray(customers.id, unique));

  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.externalId) map[row.id] = row.externalId;
  }
  return map;
}
