import { NextRequest } from "next/server";
import { z } from "zod";
import { ticketTypePresets } from "@/drizzle/schema";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { assertTenantAccess } from "@/lib/api/scope";
import { badRequest, conflict, ok } from "@/lib/api/response";
import {
  assertPresetNameAvailable,
  listTenantPresets,
  presetParentLevel,
  TicketTypePresetConflictError,
  TicketTypePresetValidationError,
} from "@/services/ticket-type-presets";

const querySchema = z.object({ tenantId: z.string().min(1).optional() });
const createSchema = z.object({
  tenantId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).default(0),
});

export const GET = withAuth({ permission: "ticket_type.preset.read" }, async (req: NextRequest, ctx) => {
  const { tenantId } = parseQuery(req, querySchema);
  if (tenantId) await assertTenantAccess(ctx, tenantId);
  return ok(await listTenantPresets(ctx.db, tenantId ? [tenantId] : ctx.isSuperAdmin ? undefined : ctx.tenantIds));
});

export const POST = withAuth({ permission: "ticket_type.preset.write" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  await assertTenantAccess(ctx, body.tenantId);
  const parentId = body.parentId ?? null;
  let level: number;
  try {
    level = await presetParentLevel(ctx.db, body.tenantId, parentId);
    await assertPresetNameAvailable(ctx.db, { tenantId: body.tenantId, parentId, name: body.name });
  } catch (error) {
    if (error instanceof TicketTypePresetConflictError) throw conflict(error.message);
    if (error instanceof TicketTypePresetValidationError) throw badRequest(error.message);
    throw error;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await ctx.db.insert(ticketTypePresets).values({
    id,
    tenantId: body.tenantId,
    parentId,
    level,
    name: body.name,
    description: body.description?.trim() || null,
    sortOrder: body.sortOrder,
    createdBy: ctx.user.id,
    createdAt: now,
    updatedAt: now,
  });
  return ok(await ctx.db.query.ticketTypePresets.findFirst({ where: (row, { eq }) => eq(row.id, id) }), 201);
});
