import { NextRequest } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { replies } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withCustomerAuth } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import {
  serializeTicketForCustomer,
  serializeReplyForCustomer,
} from "@/lib/tickets/serialize";

/**
 * GET /api/toc/tickets/:id — ticket detail with the public conversation
 * thread (internal agent notes are excluded).
 */
export const GET = withCustomerAuth(async (_req: NextRequest, ctx) => {
  const ticket = await loadCustomerTicket(ctx, ctx.params.id);

  const replyRows = await ctx.db
    .select()
    .from(replies)
    .where(and(eq(replies.ticketId, ticket.id), eq(replies.internal, false)))
    .orderBy(asc(replies.createdAt));

  return ok({
    ticket: serializeTicketForCustomer(ticket),
    replies: replyRows.map(serializeReplyForCustomer),
  });
});
