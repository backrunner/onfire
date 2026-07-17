import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  productTeams,
  ticketTemplateVersions,
  ticketTemplates,
  ticketTypeRoutes,
  ticketTypes,
  type TicketTemplateVersionRow,
  type TicketTypeRow,
} from "@/drizzle/schema";
import type { TicketTypePathItem } from "@/lib/types";

export const MAX_TICKET_TYPE_DEPTH = 3;

export async function ensureUnclassifiedType(db: Database, productId: string) {
  const existing = await db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.productId, productId),
      eq(ticketTypes.systemKey, "unclassified")
    ),
  });
  if (existing) return existing;

  const now = new Date().toISOString();
  await db
    .insert(ticketTypes)
    .values({
      id: crypto.randomUUID(),
      productId,
      level: 1,
      name: "Unclassified",
      description: "System fallback for messages that cannot be classified",
      sortOrder: -2147483648,
      systemKey: "unclassified",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const created = await db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.productId, productId),
      eq(ticketTypes.systemKey, "unclassified")
    ),
  });
  if (!created) throw new Error("Failed to create unclassified ticket type");
  return created;
}

export async function loadTicketTypePath(
  db: Database,
  type: TicketTypeRow
): Promise<TicketTypeRow[]> {
  const path: TicketTypeRow[] = [type];
  const seen = new Set([type.id]);
  let current = type;

  while (current.parentId) {
    if (seen.has(current.parentId)) throw new Error("Ticket type hierarchy contains a cycle");
    const parent = await db.query.ticketTypes.findFirst({
      where: eq(ticketTypes.id, current.parentId),
    });
    if (!parent || parent.productId !== type.productId) {
      throw new Error("Ticket type hierarchy crosses product scope");
    }
    path.unshift(parent);
    seen.add(parent.id);
    current = parent;
    if (path.length > MAX_TICKET_TYPE_DEPTH) {
      throw new Error("Ticket type hierarchy exceeds three levels");
    }
  }
  return path;
}

export function ticketTypePathSnapshot(path: TicketTypeRow[]): TicketTypePathItem[] {
  return path.map(({ id, name }) => ({ id, name }));
}

export async function resolveTicketTypeTeam(
  db: Database,
  path: TicketTypeRow[],
  defaultTeamId: string | null
): Promise<string | null> {
  const ids = path.map((item) => item.id);
  const routes = ids.length
    ? await db
        .select()
        .from(ticketTypeRoutes)
        .where(inArray(ticketTypeRoutes.ticketTypeId, ids))
    : [];
  const byType = new Map(routes.map((route) => [route.ticketTypeId, route.teamId]));
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const teamId = byType.get(path[index].id);
    if (teamId) return teamId;
  }
  return defaultTeamId;
}

export async function assertTypeRouteTeam(
  db: Database,
  productId: string,
  teamId: string
): Promise<void> {
  const association = await db
    .select({ teamId: productTeams.teamId })
    .from(productTeams)
    .where(
      and(eq(productTeams.productId, productId), eq(productTeams.teamId, teamId))
    )
    .get();
  if (!association) throw new Error("Team is not attached to this product");
}

export interface ActiveTemplateVersion {
  template: typeof ticketTemplates.$inferSelect;
  version: TicketTemplateVersionRow;
}

export async function loadCurrentTemplateVersion(
  db: Database,
  ticketTypeId: string
): Promise<ActiveTemplateVersion | null> {
  const template = await db.query.ticketTemplates.findFirst({
    where: and(
      eq(ticketTemplates.ticketTypeId, ticketTypeId),
      isNull(ticketTemplates.archivedAt)
    ),
  });
  if (!template?.currentVersionId) return null;
  const version = await db.query.ticketTemplateVersions.findFirst({
    where: and(
      eq(ticketTemplateVersions.id, template.currentVersionId),
      eq(ticketTemplateVersions.templateId, template.id),
      isNull(ticketTemplateVersions.invalidatedAt)
    ),
  });
  return version ? { template, version } : null;
}

export async function listProductTypeTemplates(db: Database, productId: string) {
  const types = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.productId, productId))
    .orderBy(asc(ticketTypes.level), asc(ticketTypes.sortOrder), asc(ticketTypes.name));
  if (types.length === 0) return { types, templates: [], versions: [] };
  const templates = await db
    .select()
    .from(ticketTemplates)
    .where(inArray(ticketTemplates.ticketTypeId, types.map((type) => type.id)));
  const versionIds = templates
    .map((template) => template.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await db
        .select()
        .from(ticketTemplateVersions)
        .where(inArray(ticketTemplateVersions.id, versionIds))
    : [];
  return { types, templates, versions };
}

