import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { notFound } from "@/lib/api/response";
import type { CustomerContext } from "@/lib/api/handler";

/**
 * Load a ticket and verify it belongs to the authenticated customer.
 * Ownership is the canonical customerId link, with an email fallback for
 * tickets created before the link existed (or via inbound email).
 * 404 on any mismatch to avoid leaking ticket existence across customers.
 */
export async function loadCustomerTicket(ctx: CustomerContext, id: string) {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, id),
  });

  const owned =
    ticket &&
    ticket.productId === ctx.customer.productId &&
    (ticket.customerId === ctx.customer.sub ||
      (Boolean(ticket.customerEmail) &&
        Boolean(ctx.customer.email) &&
        ticket.customerEmail!.toLowerCase() ===
          ctx.customer.email!.toLowerCase()));

  if (!owned) {
    throw notFound("Ticket not found");
  }
  return ticket;
}
