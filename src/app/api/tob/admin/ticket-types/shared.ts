import { and, eq, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  ticketTemplates,
  ticketTypes,
  type TicketTypeRow,
} from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/api/response";
import { assertProductAccess } from "@/lib/api/scope";
import { hasPermission } from "@/lib/types";
import { loadTicketTypePath, MAX_TICKET_TYPE_DEPTH } from "@/services/ticket-types";

export async function loadAccessibleTicketType(ctx: AuthedContext, id: string) {
  const type = await ctx.db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, id) });
  if (!type) throw notFound("Ticket type not found");
  await assertProductAccess(ctx, type.productId);
  return type;
}

export async function assertUniqueSiblingName(
  ctx: AuthedContext,
  input: { productId: string; parentId: string | null; name: string; excludeId?: string }
) {
  const rows = await ctx.db
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .where(
      and(
        eq(ticketTypes.productId, input.productId),
        input.parentId
          ? eq(ticketTypes.parentId, input.parentId)
          : isNull(ticketTypes.parentId),
        sql`lower(${ticketTypes.name}) = ${input.name.toLowerCase()}`
      )
    );
  if (rows.some((row) => row.id !== input.excludeId)) {
    throw conflict("A ticket type with this name already exists at this level");
  }
}

export async function resolveParentLevel(
  ctx: AuthedContext,
  productId: string,
  parentId?: string | null
) {
  if (!parentId) return 1;
  const parent = await loadAccessibleTicketType(ctx, parentId);
  if (parent.productId !== productId) throw badRequest("Parent type belongs to another product");
  if (parent.archivedAt) throw badRequest("Parent type is archived");
  if (parent.level >= MAX_TICKET_TYPE_DEPTH) {
    throw badRequest("Ticket type hierarchy cannot exceed three levels");
  }
  return parent.level + 1;
}

export async function moveTicketType(
  ctx: AuthedContext,
  type: TicketTypeRow,
  parentId: string | null
) {
  const rows = await ctx.db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.productId, type.productId));
  const byParent = new Map<string | null, TicketTypeRow[]>();
  for (const row of rows) {
    const children = byParent.get(row.parentId) ?? [];
    children.push(row);
    byParent.set(row.parentId, children);
  }

  const descendants: TicketTypeRow[] = [];
  const visited = new Set([type.id]);
  const visit = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child);
      visit(child.id);
    }
  };
  visit(type.id);
  if (parentId === type.id || descendants.some((row) => row.id === parentId)) {
    throw badRequest("Ticket type cannot be moved below itself");
  }

  const nextLevel = await resolveParentLevel(ctx, type.productId, parentId);
  const deepestOffset = descendants.reduce(
    (max, row) => Math.max(max, row.level - type.level),
    0
  );
  if (nextLevel + deepestOffset > MAX_TICKET_TYPE_DEPTH) {
    throw badRequest("Moving this type would exceed three levels");
  }

  const now = new Date().toISOString();
  const delta = nextLevel - type.level;
  const statements: BatchItem<"sqlite">[] = [
    ctx.db
      .update(ticketTypes)
      .set({ parentId, level: nextLevel, updatedAt: now })
      .where(eq(ticketTypes.id, type.id)),
  ];
  for (const descendant of descendants) {
    statements.push(
      ctx.db
        .update(ticketTypes)
        .set({ level: descendant.level + delta, updatedAt: now })
        .where(eq(ticketTypes.id, descendant.id))
    );
  }
  await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

export async function ticketTypeDetail(ctx: AuthedContext, type: TicketTypeRow) {
  const canReadTemplate = hasPermission(ctx.role, "ticket_template.read");
  const [path, template] = await Promise.all([
    loadTicketTypePath(ctx.db, type),
    canReadTemplate
      ? ctx.db.query.ticketTemplates.findFirst({
          where: eq(ticketTemplates.ticketTypeId, type.id),
        })
      : undefined,
  ]);
  return {
    ...type,
    path: path.map(({ id, name }) => ({ id, name })),
    template: template ?? null,
  };
}
