import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { history, products, teams, tenants, tickets } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { runScheduledScan } from "@/services/sla-scan";
import { createTestDb, minutesAgo, NOW, uid } from "./test-db";

vi.mock("@/services/ticket-events", () => ({
  emitTicketEventSync: vi.fn().mockResolvedValue(undefined),
}));

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("scheduled scan concurrency", () => {
  it("claims an auto-close once across overlapping scans", async () => {
    const tenantId = uid("tenant");
    const productId = uid("product");
    const teamId = uid("team");
    const ticketId = uid("ticket");
    await db.insert(tenants).values({ id: tenantId, name: tenantId });
    await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
    await db.insert(products).values({
      id: productId,
      tenantId,
      name: productId,
      autoCloseMinutes: 1,
    });
    await db.insert(tickets).values({
      id: ticketId,
      tenantId,
      productId,
      teamId,
      status: TicketStatus.Replied,
      priority: TicketPriority.Medium,
      subject: "Waiting on customer",
      content: "Details",
      createdAt: NOW(),
      updatedAt: minutesAgo(5),
    });

    const reports = await Promise.all([
      runScheduledScan(db),
      runScheduledScan(db),
    ]);
    expect(reports.reduce((sum, report) => sum + report.autoClosed, 0)).toBe(1);

    const closed = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });
    expect(closed?.status).toBe(TicketStatus.Closed);
    const rows = await db
      .select({ id: history.id })
      .from(history)
      .where(and(eq(history.ticketId, ticketId), eq(history.action, "auto_closed")));
    expect(rows).toHaveLength(1);
  });
});
