import { eq } from "drizzle-orm";
import { customers } from "@/drizzle/schema";
import type { Database } from "@/lib/db";

/** A linked ticket follows the customer's current email, including opt-out. */
export async function ticketCustomerEmail(db: Database, ticket: {
  customerId: string | null;
  customerEmail: string | null;
  productId: string;
  tenantId: string;
}): Promise<string | null> {
  if (!ticket.customerId) return ticket.customerEmail;
  const owner = await db.query.customers.findFirst({ where: eq(customers.id, ticket.customerId) });
  if (!owner || owner.productId !== ticket.productId || owner.tenantId !== ticket.tenantId) return null;
  return owner.email;
}
