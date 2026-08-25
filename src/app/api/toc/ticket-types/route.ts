import { NextRequest } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  products,
  ticketTemplates,
  ticketTemplateVersions,
  ticketTypes,
} from "@/drizzle/schema";
import { withCustomerAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import {
  parseI18nRecord,
  requestedTocLanguage,
  resolveProductLanguage,
} from "@/lib/product-language";

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

export const GET = withCustomerAuth(async (req: NextRequest, { db, customer }) => {
  const [product, types] = await Promise.all([
    db.query.products.findFirst({
      where: eq(products.id, customer.productId),
    }),
    db
      .select()
      .from(ticketTypes)
      .where(
        and(
          eq(ticketTypes.productId, customer.productId),
          isNull(ticketTypes.archivedAt),
          isNull(ticketTypes.systemKey)
        )
      )
      .orderBy(asc(ticketTypes.level), asc(ticketTypes.sortOrder), asc(ticketTypes.name)),
  ]);
  if (types.length === 0) return ok([]);
  // Language priority: ?lang= query → onfire-lang cookie → Accept-Language
  // intersected with the product languages → product default.
  const lang = resolveProductLanguage(
    product ?? { defaultLanguage: "en", supportedLanguages: null },
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );

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
    // Project the i18n companions into the resolved language; the base
    // columns (product default language) are the fallback and the raw i18n
    // fields are not exposed to the customer.
    const nameI18n = parseI18nRecord(type.nameI18n);
    const descriptionI18n = parseI18nRecord(type.descriptionI18n);
    byId.set(type.id, {
      id: type.id,
      parentId: type.parentId,
      name: nameI18n?.[lang] ?? type.name,
      description: descriptionI18n?.[lang] ?? type.description,
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

