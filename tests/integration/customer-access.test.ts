import { describe, it, expect, beforeAll } from "vitest";
import { tenants, teams, products, tickets, customers } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import type { Database } from "@/lib/db";
import type { CustomerContext } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { createTestDb, uid, NOW } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

async function seedTicket(options: {
  productId: string;
  customerId?: string | null;
  customerEmail?: string | null;
}) {
  const tenantId = uid("tenant");
  const teamId = uid("team");
  await db.insert(tenants).values({ id: tenantId, name: tenantId });
  await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
  await db
    .insert(products)
    .values({ id: options.productId, tenantId, name: options.productId })
    .onConflictDoNothing();

  const ticketId = uid("ticket");
  await db.insert(tickets).values({
    id: ticketId,
    tenantId,
    productId: options.productId,
    teamId,
    status: TicketStatus.New,
    priority: TicketPriority.Medium,
    subject: "s",
    content: "c",
    customerId: options.customerId ?? null,
    customerEmail: options.customerEmail ?? null,
    createdAt: NOW(),
    updatedAt: NOW(),
  });
  return ticketId;
}

function ctxFor(customer: {
  sub: string;
  productId: string;
  email?: string;
}): CustomerContext {
  return {
    db,
    customer: { tenantId: "t", ...customer },
    params: {},
  } as unknown as CustomerContext;
}

describe("customer ticket ownership", () => {
  it("grants access via the canonical customerId link (no email involved)", async () => {
    const productId = uid("prod");
    const customerId = uid("cust");
    const ticketId = await seedTicket({ productId, customerId });

    const ticket = await loadCustomerTicket(
      ctxFor({ sub: customerId, productId }),
      ticketId
    );
    expect(ticket.id).toBe(ticketId);
  });

  it("falls back to case-insensitive email match for legacy tickets", async () => {
    const productId = uid("prod");
    const ticketId = await seedTicket({
      productId,
      customerEmail: "User@Example.com",
    });

    const ticket = await loadCustomerTicket(
      ctxFor({ sub: uid("cust"), productId, email: "user@example.com" }),
      ticketId
    );
    expect(ticket.id).toBe(ticketId);
  });

  it("rejects other customers, other products, and anonymous non-owners", async () => {
    const productId = uid("prod");
    const ownerId = uid("cust");
    const ticketId = await seedTicket({
      productId,
      customerId: ownerId,
      customerEmail: "owner@example.com",
    });

    // Different customer with a different email
    await expect(
      loadCustomerTicket(
        ctxFor({ sub: uid("cust"), productId, email: "other@example.com" }),
        ticketId
      )
    ).rejects.toThrow();

    // Right customer id, wrong product
    await expect(
      loadCustomerTicket(
        ctxFor({ sub: ownerId, productId: uid("prod") }),
        ticketId
      )
    ).rejects.toThrow();

    // Anonymous (no email) customer that isn't the owner
    await expect(
      loadCustomerTicket(ctxFor({ sub: uid("cust"), productId }), ticketId)
    ).rejects.toThrow();
  });

  it("never matches two anonymous tickets across customers (null email is not a wildcard)", async () => {
    const productId = uid("prod");
    const ticketId = await seedTicket({ productId, customerId: uid("cust") });

    await expect(
      loadCustomerTicket(ctxFor({ sub: uid("cust"), productId }), ticketId)
    ).rejects.toThrow();
  });

  it("allows multiple email-less customers per product (unique index sanity)", async () => {
    const productId = uid("prod");
    const tenantId = uid("tenant");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db
      .insert(products)
      .values({ id: productId, tenantId, name: productId });

    for (const ext of ["ext-1", "ext-2"]) {
      await db.insert(customers).values({
        id: uid("cust"),
        tenantId,
        productId,
        email: null,
        externalId: ext,
        createdAt: NOW(),
        updatedAt: NOW(),
      });
    }

    // And multiple externalId-less customers with distinct emails
    for (const mail of ["a@x.com", "b@x.com"]) {
      await db.insert(customers).values({
        id: uid("cust"),
        tenantId,
        productId,
        email: mail,
        externalId: null,
        createdAt: NOW(),
        updatedAt: NOW(),
      });
    }
  });
});
