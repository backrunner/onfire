import { NextRequest } from "next/server";
import { z } from "zod";
import { ticketTypeInternalStates } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { badRequest, conflict, ok } from "@/lib/api/response";
import { listInternalStates, normalizeStateOptions, serializeState } from "@/services/ticket-internal-states";
import { loadAccessibleTicketType } from "../../shared";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  kind: z.enum(["boolean", "select"]),
  options: z.array(z.string()).max(50).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).default(0),
});

export const GET = withAuth({ permission: "ticket_type.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  return ok((await listInternalStates(ctx.db, type.id)).map(serializeState));
});

export const POST = withAuth({ permission: "ticket_type.write" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.archivedAt || type.systemKey) throw badRequest("Internal states require an active customer-facing ticket type");
  const body = await parseBody(req, createSchema);
  const existing = (await listInternalStates(ctx.db, type.id)).find(
    (state) => state.name.toLowerCase() === body.name.toLowerCase()
  );
  if (existing) throw conflict("An internal state with this name already exists for the ticket type");
  let options: string | null;
  try {
    options = normalizeStateOptions(body.kind, body.options);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Invalid state options");
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await ctx.db.insert(ticketTypeInternalStates).values({
    id,
    ticketTypeId: type.id,
    name: body.name,
    description: body.description?.trim() || null,
    kind: body.kind,
    options,
    sortOrder: body.sortOrder,
    createdBy: ctx.user.id,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.query.ticketTypeInternalStates.findFirst({ where: (row, { eq }) => eq(row.id, id) });
  return ok(created ? serializeState(created) : null, 201);
});
