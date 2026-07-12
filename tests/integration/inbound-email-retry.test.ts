import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  emailConfigs,
  inboundEmails,
  products,
  teams,
  tenants,
  tickets,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { processInboundEmail } from "@/services/email/inbound";
import { createTestDb, NOW, uid } from "./test-db";

vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("inbound email retries", () => {
  it("reclaims an errored message and creates exactly one ticket", async () => {
    const productId = uid("product");
    const address = `${uid("support")}@example.com`;
    const now = NOW();
    await db.insert(emailConfigs).values({
      id: uid("email-config"),
      productId,
      inboundEnabled: true,
      inboundProvider: "generic",
      inboundAddress: address,
      aiFilterEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    const payload = {
      provider: "generic" as const,
      fromEmail: "customer@example.com",
      toEmail: address,
      subject: "Need help",
      bodyPlain: "The dashboard does not load.",
      messageId: "retry-message@example.com",
    };
    await expect(processInboundEmail(db, payload)).resolves.toMatchObject({
      action: "error",
    });

    const failed = await db.query.inboundEmails.findFirst({
      where: eq(inboundEmails.messageId, payload.messageId),
    });
    expect(failed?.processingStatus).toBe("error");

    const tenantId = uid("tenant");
    const teamId = uid("team");
    await db.insert(tenants).values({
      id: tenantId,
      name: tenantId,
      defaultTeamId: teamId,
    });
    await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
    await db.insert(products).values({ id: productId, tenantId, name: productId });

    await expect(processInboundEmail(db, payload)).resolves.toMatchObject({
      action: "ticket_created",
      success: true,
    });
    await expect(processInboundEmail(db, payload)).resolves.toMatchObject({
      action: "duplicate",
      success: true,
    });

    const ticketRows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.productId, productId));
    const inboundRows = await db
      .select({ id: inboundEmails.id })
      .from(inboundEmails)
      .where(eq(inboundEmails.productId, productId));
    expect(ticketRows).toHaveLength(1);
    expect(inboundRows).toHaveLength(1);
  });
});
