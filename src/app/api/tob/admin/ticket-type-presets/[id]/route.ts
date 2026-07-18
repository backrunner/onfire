import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ticketTypePresets } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, ok } from "@/lib/api/response";
import {
  assertPresetNameAvailable,
  movePreset,
  TicketTypePresetConflictError,
  TicketTypePresetValidationError,
} from "@/services/ticket-type-presets";
import { loadAccessiblePreset } from "../shared";

const updateSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
});

export const PATCH = withAuth({ permission: "ticket_type.preset.write" }, async (req: NextRequest, ctx) => {
  const preset = await loadAccessiblePreset(ctx, ctx.params.id);
  const body = await parseBody(req, updateSchema);
  const parentId = body.parentId === undefined ? preset.parentId : body.parentId;
  const name = body.name ?? preset.name;
  try {
    await assertPresetNameAvailable(ctx.db, { tenantId: preset.tenantId, parentId, name, excludeId: preset.id });
    if (body.parentId !== undefined && body.parentId !== preset.parentId) await movePreset(ctx.db, preset, body.parentId);
  } catch (error) {
    if (error instanceof TicketTypePresetConflictError) throw conflict(error.message);
    if (error instanceof TicketTypePresetValidationError) throw badRequest(error.message);
    throw error;
  }
  const now = new Date().toISOString();
  await ctx.db.update(ticketTypePresets).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description?.trim() || null }),
    ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    updatedAt: now,
  }).where(eq(ticketTypePresets.id, preset.id));
  return ok(await loadAccessiblePreset(ctx, preset.id));
});

export const DELETE = withAuth({ permission: "ticket_type.preset.write" }, async (_req, ctx) => {
  const preset = await loadAccessiblePreset(ctx, ctx.params.id);
  if (preset.archivedAt) return ok({ archived: true });
  const child = await ctx.db.query.ticketTypePresets.findFirst({
    where: and(eq(ticketTypePresets.parentId, preset.id), isNull(ticketTypePresets.archivedAt)),
  });
  if (child) throw conflict("Archive child presets first");
  const now = new Date().toISOString();
  await ctx.db.update(ticketTypePresets).set({ archivedAt: now, archivedBy: ctx.user.id, updatedAt: now }).where(eq(ticketTypePresets.id, preset.id));
  return ok({ archived: true });
});
