import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { products, ticketTypes } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, ok } from "@/lib/api/response";
import {
  parseSupportedLanguages,
  unsupportedI18nKeys,
} from "@/lib/product-language";
import {
  assertUniqueSiblingName,
  loadAccessibleTicketType,
  moveTicketType,
  ticketTypeDetail,
} from "../shared";
import { nullableI18nField } from "@/lib/i18n-schema";

const nameI18nField = nullableI18nField(200);
const descriptionI18nField = nullableI18nField(2000);

const updateSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  nameI18n: nameI18nField,
  descriptionI18n: descriptionI18nField,
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
});

export const GET = withAuth({ permission: "ticket_type.read" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  return ok(await ticketTypeDetail(ctx, type));
});

export const PATCH = withAuth({ permission: "ticket_type.write" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.systemKey) throw badRequest("System ticket types cannot be edited");
  const body = await parseBody(req, updateSchema);
  if (body.nameI18n !== undefined || body.descriptionI18n !== undefined) {
    const product = await ctx.db.query.products.findFirst({
      where: eq(products.id, type.productId),
    });
    const unsupported = unsupportedI18nKeys(
      [body.nameI18n, body.descriptionI18n],
      parseSupportedLanguages(product?.supportedLanguages),
      product?.defaultLanguage
    );
    if (unsupported.length > 0) {
      throw badRequest("Translations contain unsupported languages", unsupported);
    }
  }
  const parentId = body.parentId !== undefined ? body.parentId : type.parentId;
  const name = body.name ?? type.name;
  await assertUniqueSiblingName(ctx, {
    productId: type.productId,
    parentId,
    name,
    excludeId: type.id,
  });
  if (body.parentId !== undefined && body.parentId !== type.parentId) {
    await moveTicketType(ctx, type, body.parentId);
  }
  const now = new Date().toISOString();
  await ctx.db
    .update(ticketTypes)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.nameI18n !== undefined && { nameI18n: body.nameI18n ? JSON.stringify(body.nameI18n) : null }),
      ...(body.descriptionI18n !== undefined && { descriptionI18n: body.descriptionI18n ? JSON.stringify(body.descriptionI18n) : null }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      updatedAt: now,
    })
    .where(eq(ticketTypes.id, type.id));
  const updated = await loadAccessibleTicketType(ctx, type.id);
  return ok(await ticketTypeDetail(ctx, updated));
});

export const DELETE = withAuth({ permission: "ticket_type.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.systemKey) throw badRequest("System ticket types cannot be archived");
  if (type.archivedAt) return ok({ archived: true });
  const activeChild = await ctx.db.query.ticketTypes.findFirst({
    where: and(eq(ticketTypes.parentId, type.id), isNull(ticketTypes.archivedAt)),
  });
  if (activeChild) throw conflict("Archive child ticket types first");
  const now = new Date().toISOString();
  await ctx.db
    .update(ticketTypes)
    .set({ archivedAt: now, archivedBy: ctx.user.id, updatedAt: now })
    .where(eq(ticketTypes.id, type.id));
  return ok({ archived: true });
});
