import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { products, tickets, history } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import type { Database } from "@/lib/db";
import { runScheduledScan } from "@/services/sla-scan";
import { createTestDb, uid, NOW, minutesAgo, minutesFromNow } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

async function seedTicket(overrides: Partial<typeof tickets.$inferInsert>) {
  const id = uid("ticket");
  await db.insert(tickets).values({
    id,
    tenantId: uid("tenant"),
    productId: uid("prod"),
    teamId: uid("team"),
    status: TicketStatus.New,
    priority: TicketPriority.Medium,
    subject: "sla",
    content: "sla",
    customerEmail: "c@example.com",
    createdAt: NOW(),
    updatedAt: NOW(),
    ...overrides,
  });
  return id;
}

const loadTicket = async (id: string) =>
  (await db.query.tickets.findFirst({ where: eq(tickets.id, id) }))!;

describe("SLA scan", () => {
  it("warns once inside the warning window without marking a breach", async () => {
    const id = await seedTicket({
      slaAcceptDeadline: minutesFromNow(10),
    });

    await runScheduledScan(db);
    let row = await loadTicket(id);
    expect(row.slaAcceptWarned).toBe(true);
    expect(row.slaAcceptBreached).toBe(false);

    // Second scan must not re-warn (flag already set) — verified by the
    // report counting zero new accept warnings for this ticket.
    const report = await runScheduledScan(db);
    row = await loadTicket(id);
    expect(row.slaAcceptWarned).toBe(true);
    expect(report.acceptWarnings).toBe(0);
  });

  it("does not warn when the deadline is far away", async () => {
    const id = await seedTicket({
      slaAcceptDeadline: minutesFromNow(120),
    });

    await runScheduledScan(db);
    const row = await loadTicket(id);
    expect(row.slaAcceptWarned).toBe(false);
    expect(row.slaAcceptBreached).toBe(false);
  });

  it("marks accept breaches for overdue new tickets", async () => {
    const id = await seedTicket({
      slaAcceptDeadline: minutesAgo(5),
    });

    await runScheduledScan(db);
    const row = await loadTicket(id);
    expect(row.slaAcceptBreached).toBe(true);
    expect(row.slaAcceptWarned).toBe(true);
  });

  it("marks reply breaches only for accepted (processing/escalated) tickets", async () => {
    const processing = await seedTicket({
      status: TicketStatus.Processing,
      slaReplyDeadline: minutesAgo(5),
    });
    const replied = await seedTicket({
      status: TicketStatus.Replied,
      slaReplyDeadline: minutesAgo(5),
    });

    await runScheduledScan(db);
    expect((await loadTicket(processing)).slaReplyBreached).toBe(true);
    expect((await loadTicket(replied)).slaReplyBreached).toBe(false);
  });

  it("auto-closes replied tickets after the product inactivity window", async () => {
    const productId = uid("prod");
    await db.insert(products).values({
      id: productId,
      tenantId: uid("tenant"),
      name: "p",
      autoCloseMinutes: 60,
    });

    const stale = await seedTicket({
      productId,
      status: TicketStatus.Replied,
      updatedAt: minutesAgo(120),
    });
    const fresh = await seedTicket({
      productId,
      status: TicketStatus.Replied,
      updatedAt: minutesAgo(10),
    });

    await runScheduledScan(db);

    expect((await loadTicket(stale)).status).toBe(TicketStatus.Closed);
    expect((await loadTicket(fresh)).status).toBe(TicketStatus.Replied);

    const events = await db
      .select()
      .from(history)
      .where(eq(history.ticketId, stale));
    expect(events.some((h) => h.action === "auto_closed")).toBe(true);
  });

  it("leaves products without auto-close configured alone", async () => {
    const productId = uid("prod");
    await db.insert(products).values({
      id: productId,
      tenantId: uid("tenant"),
      name: "p",
      autoCloseMinutes: null,
    });

    const id = await seedTicket({
      productId,
      status: TicketStatus.Replied,
      updatedAt: minutesAgo(10_000),
    });

    await runScheduledScan(db);
    expect((await loadTicket(id)).status).toBe(TicketStatus.Replied);
  });
});
