import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { notFound } from "@/lib/api/response";
import type { CustomerContext } from "@/lib/api/handler";

/**
 * Load a ticket and verify it belongs to the authenticated customer
 * (same product + same email). 404 on any mismatch to avoid leaking
 * ticket existence across customers.
 */
export async function loadCustomerTicket(ctx: CustomerContext, id: string) {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, id),
  });
  if (
    !ticket ||
    ticket.productId !== ctx.customer.productId ||
    ticket.customerEmail.toLowerCase() !== ctx.customer.email.toLowerCase()
  ) {
    throw notFound("Ticket not found");
  }
  return ticket;
}
