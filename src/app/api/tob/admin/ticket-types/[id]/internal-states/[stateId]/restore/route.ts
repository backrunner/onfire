import { eq } from "drizzle-orm";
import { ticketTypeInternalStates } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { badRequest, notFound, ok } from "@/lib/api/response";
import { loadInternalState } from "@/services/ticket-internal-states";
import { loadAccessibleTicketType } from "../../../../shared";

export const POST = withAuth({ permission: "ticket_type.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.archivedAt || type.systemKey) {
    throw badRequest("Restore the customer-facing ticket type before its internal states");
  }
  const state = await loadInternalState(ctx.db, ctx.params.stateId);
  if (!state || state.ticketTypeId !== type.id) throw notFound("Internal state not found");
  await ctx.db.update(ticketTypeInternalStates).set({ archivedAt: null, archivedBy: null, updatedAt: new Date().toISOString() }).where(eq(ticketTypeInternalStates.id, state.id));
  return ok({ restored: true });
});
