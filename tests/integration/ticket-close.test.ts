import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { history, products, tenants, tickets, userProducts, users } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { resolveAuthedContext } from "@/lib/api/handler";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import type { McpGrantContext } from "@/lib/mcp/grants";
import { closeMcpTicket } from "@/lib/mcp/ticket-operations";
import { closeTicket } from "@/services/ticket-close";
import { sendTicketNotification } from "@/services/email/outbound";
import { sendRecipientNotifications } from "@/services/notification/service";
import { POST as close } from "@/app/api/tob/tickets/[id]/close/route";
import { POST as bulkClose } from "@/app/api/tob/tickets/bulk/close/route";
import { createTestDb } from "./test-db";

let db: Database;
let pending: Promise<unknown>[];
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: "test-secret" }) }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => ({ user: { id: "admin" } }) } }) }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ ctx: { waitUntil: (work: Promise<unknown>) => pending.push(work) } }) }));
vi.mock("@/services/email/outbound", () => ({ sendTicketNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/notification/service", () => ({ sendRecipientNotifications: vi.fn().mockResolvedValue(undefined) }));

beforeEach(async () => {
  vi.clearAllMocks();
  pending = [];
  db = await createTestDb();
  await db.insert(tenants).values({ id: "tenant", name: "Tenant" });
  await db.insert(products).values([{ id: "p1", tenantId: "tenant", name: "Product" }, { id: "p2", tenantId: "tenant", name: "Foreign" }]);
  await db.insert(users).values({ id: "admin", email: "admin@example.com", displayName: "Admin", tenantId: "tenant", role: Role.ProductAdmin });
  await db.insert(userProducts).values({ userId: "admin", productId: "p1" });
  await db.insert(tickets).values(["one", "two", "foreign"].map(id => ({
    id, tenantId: "tenant", productId: id === "foreign" ? "p2" : "p1", teamId: "team",
    subject: id, content: "body", status: TicketStatus.Processing, priority: TicketPriority.Medium,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  })));
});

function request(path: string, body: unknown) {
  return new NextRequest(`https://admin.example.com/api/tob/tickets/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("customer closure notification choice", () => {
  it.each([undefined, true, false])("single close with notifyCustomer=%s preserves audit and staff delivery", async (notifyCustomer) => {
    const response = await close(request("one/close", { reason: "Resolved", notifyCustomer }), context("one"));
    expect(response.status).toBe(200);
    await Promise.all(pending);
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))?.status).toBe("closed");
    const audit = await db.query.history.findFirst({ where: eq(history.ticketId, "one") });
    expect(JSON.parse(audit!.snapshot!)).toMatchObject({ reason: "Resolved", notifyCustomer: notifyCustomer ?? true });
    expect(sendRecipientNotifications).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({ ticketId: "one", triggerEvent: "ticket_closed" }));
    expect(sendTicketNotification).toHaveBeenCalledTimes(notifyCustomer === false ? 0 : 1);
    expect((await close(request("one/close", {}), context("one"))).status).toBe(400);
    expect(await db.select().from(history)).toHaveLength(1);
    expect(sendRecipientNotifications).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, false])("bulk close with notifyCustomer=%s retains partial scope failures", async (notifyCustomer) => {
    const response = await bulkClose(request("bulk/close", { ticketIds: ["one", "two", "foreign", "missing"], notifyCustomer }));
    expect(response.status).toBe(200);
    expect(z.object({ data: z.object({ succeeded: z.number(), failed: z.number() }) }).parse(await response.json()).data).toEqual({ succeeded: 2, failed: 2 });
    await Promise.all(pending);
    expect(sendRecipientNotifications).toHaveBeenCalledTimes(2);
    expect(sendTicketNotification).toHaveBeenCalledTimes(notifyCustomer === false ? 0 : 2);
    const audits = await db.select().from(history);
    expect(audits).toHaveLength(2);
    for (const audit of audits) expect(JSON.parse(audit.snapshot!)).toMatchObject({ bulk: true, notifyCustomer: notifyCustomer ?? true });
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, "foreign") }))?.status).toBe("processing");
  });

  it.each([undefined, false])("MCP close with notifyCustomer=%s uses the same delivery policy", async (notifyCustomer) => {
    const base = await resolveAuthedContext(db, "admin", {});
    const ctx = { ...base, mcpPermissions: ["tickets:close"] } as McpGrantContext;
    expect(await closeMcpTicket(ctx, { ticketId: "one", notifyCustomer })).toMatchObject({ status: "closed" });
    await Promise.all(pending);
    expect(sendRecipientNotifications).toHaveBeenCalledTimes(1);
    expect(sendTicketNotification).toHaveBeenCalledTimes(notifyCustomer === false ? 0 : 1);
    await expect(closeMcpTicket(ctx, { ticketId: "foreign", notifyCustomer: false })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects malformed choices and inaccessible tickets without side effects", async () => {
    expect((await close(request("one/close", { notifyCustomer: "false" }), context("one"))).status).toBe(400);
    expect((await bulkClose(request("bulk/close", { ticketIds: ["one"], notifyCustomer: null }))).status).toBe(400);
    expect((await close(request("foreign/close", { notifyCustomer: false }), context("foreign"))).status).toBe(403);
    expect(await db.select().from(history)).toHaveLength(0);
    expect(sendRecipientNotifications).not.toHaveBeenCalled();
    expect(sendTicketNotification).not.toHaveBeenCalled();
  });

  it("cannot send a second closure email from a stale concurrent snapshot", async () => {
    const ticket = (await db.query.tickets.findFirst({ where: eq(tickets.id, "one") }))!;
    await closeTicket(db, ticket, "admin", { notifyCustomer: false });
    await expect(closeTicket(db, ticket, "admin", { notifyCustomer: true })).rejects.toMatchObject({ status: 409 });
    await Promise.all(pending);
    expect(await db.select().from(history)).toHaveLength(1);
    expect(sendTicketNotification).not.toHaveBeenCalled();
    expect(sendRecipientNotifications).toHaveBeenCalledTimes(1);
  });
});
