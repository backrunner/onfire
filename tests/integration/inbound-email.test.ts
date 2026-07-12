import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  emailConfigs,
  tenants,
  teams,
  products,
  tickets,
  replies,
  customers,
} from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import type { Database } from "@/lib/db";
import { processInboundEmail } from "@/services/email/inbound";
import { createTestDb, uid, NOW } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

/** Seed tenant + default team + product + enabled inbound email config. */
async function seedInbound(options?: { defaultTeam?: boolean }) {
  const tenantId = uid("tenant");
  const teamId = uid("team");
  const productId = uid("prod");
  const address = `${uid("support")}@example.com`;

  await db.insert(tenants).values({
    id: tenantId,
    name: tenantId,
    defaultTeamId: options?.defaultTeam === false ? null : teamId,
  });
  await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
  await db.insert(products).values({
    id: productId,
    tenantId,
    name: productId,
    slaMediumAccept: 60,
    slaMediumReply: 240,
  });
  await db.insert(emailConfigs).values({
    id: uid("cfg"),
    productId,
    inboundEnabled: true,
    inboundProvider: "generic",
    inboundAddress: address,
    aiFilterEnabled: false,
    createdAt: NOW(),
    updatedAt: NOW(),
  });

  return { tenantId, teamId, productId, address };
}

const email = (to: string, overrides = {}) => ({
  fromEmail: "customer@example.com",
  toEmail: to,
  subject: "Help needed",
  bodyPlain: "Something is broken",
  messageId: uid("msg"),
  ...overrides,
});

describe("inbound email processing", () => {
  it("creates a ticket with SLA deadlines and a customer record", async () => {
    const { address, productId } = await seedInbound();

    const result = await processInboundEmail(db, email(address));
    expect(result.action).toBe("ticket_created");

    const ticket = (await db.query.tickets.findFirst({
      where: eq(tickets.id, result.ticketId!),
    }))!;
    expect(ticket.productId).toBe(productId);
    expect(ticket.source).toBe("email");
    expect(ticket.slaAcceptDeadline).not.toBeNull();
    // No agent was available, so the reply SLA starts only after acceptance.
    expect(ticket.slaReplyDeadline).toBeNull();

    const customer = await db.query.customers.findFirst({
      where: eq(customers.productId, productId),
    });
    expect(customer?.email).toBe("customer@example.com");
  });

  it("uses the HTML body when the plain-text part is only whitespace", async () => {
    const { address } = await seedInbound();

    const result = await processInboundEmail(
      db,
      email(address, {
        bodyPlain: "  \n\t",
        bodyHtml: "<p>The HTML fallback is useful.</p>",
      })
    );

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, result.ticketId!),
    });
    expect(result.action).toBe("ticket_created");
    expect(ticket?.content).toBe("The HTML fallback is useful.");
  });

  it("deduplicates by provider message ID", async () => {
    const { address } = await seedInbound();
    const payload = email(address);

    const first = await processInboundEmail(db, payload);
    const second = await processInboundEmail(db, payload);

    expect(first.action).toBe("ticket_created");
    expect(second.action).toBe("duplicate");
    expect(second.ticketId).toBe(first.ticketId);
  });

  it("threads replies via the ticket marker and reopens replied tickets", async () => {
    const { address } = await seedInbound();
    const created = await processInboundEmail(db, email(address));
    const ticketId = created.ticketId!;

    await db
      .update(tickets)
      .set({ status: TicketStatus.Replied })
      .where(eq(tickets.id, ticketId));

    const reply = await processInboundEmail(
      db,
      email(address, {
        subject: `Re: [Ticket #${ticketId}] Help needed`,
        bodyPlain: "Still broken",
      })
    );

    expect(reply.action).toBe("reply_added");
    const ticket = (await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    }))!;
    expect(ticket.status).toBe(TicketStatus.Processing);

    const thread = await db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, ticketId));
    expect(thread).toHaveLength(1);
    expect(thread[0].source).toBe("email");
  });

  it("does not thread replies from a different sender", async () => {
    const { address } = await seedInbound();
    const created = await processInboundEmail(db, email(address));

    const stranger = await processInboundEmail(
      db,
      email(address, {
        fromEmail: "attacker@example.com",
        subject: `Re: [Ticket #${created.ticketId}] Help needed`,
      })
    );

    // Falls through to ticket creation instead of joining the thread
    expect(stranger.action).toBe("ticket_created");
    expect(stranger.ticketId).not.toBe(created.ticketId);
  });

  it("rejects provider-flagged spam", async () => {
    const { address } = await seedInbound();
    const result = await processInboundEmail(
      db,
      email(address, { isSpam: true })
    );
    expect(result.success).toBe(false);
    expect(result.action).toBe("rejected");
  });

  it("rejects unknown inbound addresses", async () => {
    const result = await processInboundEmail(
      db,
      email("nobody@unknown.example.com")
    );
    expect(result.success).toBe(false);
    expect(result.action).toBe("rejected");
  });

  it("errors when the tenant has no default team", async () => {
    const { address } = await seedInbound({ defaultTeam: false });
    const result = await processInboundEmail(db, email(address));
    expect(result.action).toBe("error");
    expect(result.reason).toMatch(/default team/i);
  });

  it("enforces SPF in high-strictness mode", async () => {
    const { address, productId } = await seedInbound();
    await db
      .update(emailConfigs)
      .set({ aiFilterStrictness: "high" })
      .where(eq(emailConfigs.productId, productId));

    const result = await processInboundEmail(
      db,
      email(address, { spfResult: "fail" })
    );
    expect(result.action).toBe("rejected");
  });

  it("ignores priority casing in ticket defaults (medium)", async () => {
    const { address } = await seedInbound();
    const result = await processInboundEmail(db, email(address));
    const ticket = (await db.query.tickets.findFirst({
      where: eq(tickets.id, result.ticketId!),
    }))!;
    expect(ticket.priority).toBe(TicketPriority.Medium);
  });
});
