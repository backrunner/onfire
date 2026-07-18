import { NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { ticketTypes } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { badRequest, conflict, ok } from "@/lib/api/response";
import { copyPresetToProduct, TicketTypePresetValidationError } from "@/services/ticket-type-presets";
import { loadAccessiblePreset } from "../shared";

const schema = z.object({
  presetId: z.string().min(1),
  productId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
});

export const POST = withAuth({ permission: "ticket_type.preset.read" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, schema);
  const [preset, product] = await Promise.all([
    loadAccessiblePreset(ctx, body.presetId),
    assertProductAccess(ctx, body.productId),
  ]);
  if (preset.tenantId !== product.tenantId) throw badRequest("Preset and product must belong to the same tenant");
  const parentId = body.parentId ?? null;
  const duplicate = await ctx.db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.productId, product.id),
      parentId ? eq(ticketTypes.parentId, parentId) : isNull(ticketTypes.parentId),
      sql`lower(${ticketTypes.name}) = ${preset.name.toLowerCase()}`
    ),
  });
  if (duplicate) throw conflict("A ticket type with the preset root name already exists at this level");
  try {
    const created = await copyPresetToProduct(ctx.db, preset.id, product.id, parentId);
    return ok({ created }, 201);
  } catch (error) {
    if (error instanceof TicketTypePresetValidationError) throw badRequest(error.message);
    throw error;
  }
});
