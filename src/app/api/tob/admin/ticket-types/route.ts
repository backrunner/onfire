import { NextRequest } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import {
  products,
  ticketTemplates,
  ticketTemplateVersions,
  ticketTypeRoutes,
  ticketTypes,
} from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { assertProductAccess, productScopeCondition } from "@/lib/api/scope";
import { ensureUnclassifiedType } from "@/services/ticket-types";
import { hasPermission, Role } from "@/lib/types";
import { assertUniqueSiblingName, resolveParentLevel } from "./shared";

const createSchema = z.object({
  productId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).default(0),
});

export const GET = withAuth({ permission: "ticket_type.read" }, async (_req, ctx) => {
  const productRows = await ctx.db
    .select({ id: products.id })
    .from(products)
    .where(productScopeCondition(ctx));
  const productIds = productRows.map((row) => row.id);
  if (productIds.length === 0) return ok([]);
  await Promise.all(productIds.map((productId) => ensureUnclassifiedType(ctx.db, productId)));

  const types = await ctx.db
    .select()
    .from(ticketTypes)
    .where(inArray(ticketTypes.productId, productIds));
  const typeIds = types.map((type) => type.id);
  const canReadTemplates = hasPermission(ctx.role, "ticket_template.read");
  const [templates, routes] = await Promise.all([
    typeIds.length && canReadTemplates
      ? ctx.db.select().from(ticketTemplates).where(inArray(ticketTemplates.ticketTypeId, typeIds))
      : [],
    typeIds.length
      ? ctx.db.select().from(ticketTypeRoutes).where(inArray(ticketTypeRoutes.ticketTypeId, typeIds))
      : [],
  ]);
  const versionIds = templates
    .map((template) => template.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await ctx.db
        .select()
        .from(ticketTemplateVersions)
        .where(inArray(ticketTemplateVersions.id, versionIds))
    : [];
  const templatesByType = new Map(templates.map((template) => [template.ticketTypeId, template]));
  const versionsById = new Map(versions.map((version) => [version.id, version]));
  const routesByType = new Map(routes.map((route) => [route.ticketTypeId, route]));
  return ok(
    types
      .map((type) => {
        const template = templatesByType.get(type.id) ?? null;
        const currentVersion = template?.currentVersionId
          ? versionsById.get(template.currentVersionId) ?? null
          : null;
        const route = routesByType.get(type.id) ?? null;
        return {
          ...type,
          template,
          currentVersion,
          route:
            route && ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(route.teamId)
              ? null
              : route,
        };
      })
      .sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  );
});

export const POST = withAuth({ permission: "ticket_type.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  await assertProductAccess(ctx, body.productId);
  const parentId = body.parentId ?? null;
  const level = await resolveParentLevel(ctx, body.productId, parentId);
  await assertUniqueSiblingName(ctx, {
    productId: body.productId,
    parentId,
    name: body.name,
  });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await ctx.db.insert(ticketTypes).values({
    id,
    productId: body.productId,
    parentId,
    level,
    name: body.name,
    description: body.description?.trim() || null,
    sortOrder: body.sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  return ok(await ctx.db.query.ticketTypes.findFirst({ where: (t, { eq }) => eq(t.id, id) }), 201);
});
