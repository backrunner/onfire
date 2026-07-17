import { NextRequest } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  ticketTemplates,
  ticketTemplateVersions,
  ticketTypes,
  type TicketTypeRow,
} from "@/drizzle/schema";
import { withCustomerAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";

interface TicketTypeNode {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  level: number;
  sortOrder: number;
  selectable: boolean;
  children: TicketTypeNode[];
}

export const GET = withCustomerAuth(async (_req: NextRequest, { db, customer }) => {
  const types = await db
    .select()
    .from(ticketTypes)
    .where(
      and(
        eq(ticketTypes.productId, customer.productId),
        isNull(ticketTypes.archivedAt),
        isNull(ticketTypes.systemKey)
      )
    )
    .orderBy(asc(ticketTypes.level), asc(ticketTypes.sortOrder), asc(ticketTypes.name));
  if (types.length === 0) return ok([]);

  const templates = await db
    .select()
    .from(ticketTemplates)
    .where(
      and(
        inArray(ticketTemplates.ticketTypeId, types.map((type) => type.id)),
        isNull(ticketTemplates.archivedAt)
      )
    );
  const versionIds = templates
    .map((template) => template.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await db
        .select({ id: ticketTemplateVersions.id })
        .from(ticketTemplateVersions)
        .where(
          and(
            inArray(ticketTemplateVersions.id, versionIds),
            isNull(ticketTemplateVersions.invalidatedAt)
          )
        )
    : [];
  const validVersions = new Set(versions.map((version) => version.id));
  const selectable = new Set(
    templates
      .filter(
        (template) =>
          template.currentVersionId && validVersions.has(template.currentVersionId)
      )
      .map((template) => template.ticketTypeId)
  );

  const byId = new Map<string, TicketTypeNode>();
  for (const type of types) {
    byId.set(type.id, {
      id: type.id,
      parentId: type.parentId,
      name: type.name,
      description: type.description,
      level: type.level,
      sortOrder: type.sortOrder,
      selectable: selectable.has(type.id),
      children: [],
    });
  }
  const roots: TicketTypeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const retainConfiguredBranches = (node: TicketTypeNode): TicketTypeNode | null => {
    node.children = node.children
      .map(retainConfiguredBranches)
      .filter((child): child is TicketTypeNode => Boolean(child));
    return node.selectable || node.children.length > 0 ? node : null;
  };
  return ok(roots.map(retainConfiguredBranches).filter((node): node is TicketTypeNode => Boolean(node)));
});

