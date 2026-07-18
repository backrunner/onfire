import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ticketInternalStateValues, ticketTypeInternalStates } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound, ok } from "@/lib/api/response";
import { listInternalStates, loadInternalState, normalizeStateOptions, serializeState } from "@/services/ticket-internal-states";
import { loadAccessibleTicketType } from "../../../shared";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  kind: z.enum(["boolean", "select"]).optional(),
  options: z.array(z.string()).max(50).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
});

async function loadScopedState(ctx: AuthedContext) {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const state = await loadInternalState(ctx.db, ctx.params.stateId);
  if (!state || state.ticketTypeId !== type.id) throw notFound("Internal state not found");
  return state;
}

export const PATCH = withAuth({ permission: "ticket_type.write" }, async (req: NextRequest, ctx) => {
  const state = await loadScopedState(ctx);
  if (state.archivedAt) throw badRequest("Archived internal states cannot be edited");
  const body = await parseBody(req, updateSchema);
  const name = body.name ?? state.name;
  const duplicate = (await listInternalStates(ctx.db, state.ticketTypeId)).find(
    (item) => item.id !== state.id && item.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) throw conflict("An internal state with this name already exists for the ticket type");
  const kind = body.kind ?? state.kind;
  let options = state.options;
  if (body.kind !== undefined || body.options !== undefined) {
    try {
      options = normalizeStateOptions(kind, body.options ?? (kind === state.kind ? serializeState(state).options : null));
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : "Invalid state options");
    }
  }
  const existingValues = await ctx.db
    .select({ value: ticketInternalStateValues.value })
    .from(ticketInternalStateValues)
    .where(eq(ticketInternalStateValues.stateId, state.id));
  if (existingValues.length > 0 && kind !== state.kind) {
    throw conflict("Archive this state and create a new one to change its control type");
  }
  if (
    existingValues.length > 0 &&
    kind === "select" &&
    !existingValues.every((item) => serializeState({ ...state, kind, options }).options.includes(item.value))
  ) {
    throw conflict("Options currently used by tickets cannot be removed");
  }
  await ctx.db.update(ticketTypeInternalStates).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.description !== undefined && { description: body.description?.trim() || null }),
    kind,
    options,
    ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    updatedAt: new Date().toISOString(),
  }).where(eq(ticketTypeInternalStates.id, state.id));
  const updated = await loadInternalState(ctx.db, state.id);
  return ok(updated ? serializeState(updated) : null);
});

export const DELETE = withAuth({ permission: "ticket_type.write" }, async (_req, ctx) => {
  const state = await loadScopedState(ctx);
  if (!state.archivedAt) {
    await ctx.db.update(ticketTypeInternalStates).set({ archivedAt: new Date().toISOString(), archivedBy: ctx.user.id, updatedAt: new Date().toISOString() }).where(eq(ticketTypeInternalStates.id, state.id));
  }
  return ok({ archived: true });
});
