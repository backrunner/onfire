import { eq } from "drizzle-orm";
import { ticketTypes } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { badRequest, ok } from "@/lib/api/response";
import { loadAccessibleTicketType } from "../../shared";

export const POST = withAuth({ permission: "ticket_type.write" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  if (type.systemKey) throw badRequest("System ticket types cannot be restored");
  if (type.parentId) {
    const parent = await loadAccessibleTicketType(ctx, type.parentId);
    if (parent.archivedAt) throw badRequest("Restore the parent ticket type first");
  }
  const now = new Date().toISOString();
  await ctx.db
    .update(ticketTypes)
    .set({ archivedAt: null, archivedBy: null, updatedAt: now })
    .where(eq(ticketTypes.id, type.id));
  return ok({ restored: true });
});

