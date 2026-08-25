import { NextRequest } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { products, replies } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withCustomerAuth } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import {
  serializeTicketForCustomer,
  serializeReplyForCustomer,
} from "@/lib/tickets/serialize";
import {
  requestedTocLanguage,
  resolveProductLanguage,
} from "@/lib/product-language";

/**
 * GET /api/toc/tickets/:id — ticket detail with the public conversation
 * thread (internal agent notes are excluded).
 */
export const GET = withCustomerAuth(async (req: NextRequest, ctx) => {
  const ticket = await loadCustomerTicket(ctx, ctx.params.id);
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  const language = resolveProductLanguage(
    product ?? { defaultLanguage: ticket.customerLanguage ?? "en", supportedLanguages: null },
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );

  const replyRows = await ctx.db
    .select()
    .from(replies)
    .where(and(eq(replies.ticketId, ticket.id), eq(replies.internal, false)))
    .orderBy(asc(replies.createdAt));

  return ok({
    ticket: serializeTicketForCustomer(ticket, language),
    replies: replyRows.map((reply) => serializeReplyForCustomer(reply, language)),
  });
});
