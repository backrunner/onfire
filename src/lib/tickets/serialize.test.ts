import { describe, expect, it } from "vitest";
import type { TicketRow } from "@/drizzle/schema";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { serializeTicketForCustomer } from "./serialize";

describe("serializeTicketForCustomer", () => {
  it("omits internal ticket type and template version identifiers", () => {
    const ticket = {
      id: "ticket-1",
      tenantId: "tenant-1",
      productId: "product-1",
      teamId: "team-1",
      status: TicketStatus.New,
      priority: TicketPriority.Medium,
      subject: "Need help",
      content: "The application is unavailable",
      ticketTypeId: "type-1",
      templateVersionId: "version-2",
      ticketTypePath: JSON.stringify([{ id: "type-1", name: "Incident" }]),
      metadata: JSON.stringify({ environment: "production" }),
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    } as TicketRow;

    const result = serializeTicketForCustomer(ticket);

    expect(result).toMatchObject({
      id: "ticket-1",
      metadata: { environment: "production" },
    });
    expect(result).not.toHaveProperty("ticketTypeId");
    expect(result).not.toHaveProperty("templateVersionId");
    expect(result).not.toHaveProperty("ticketTypePath");
  });
});
