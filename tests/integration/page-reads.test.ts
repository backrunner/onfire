import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { agentTeams, customers, products, productTeams, teams, tenants, tickets, ticketTemplates, ticketTemplateVersions, ticketTypes, userProducts, users } from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import { resolveAuthedContext, withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { sealPreviewCookie, PREVIEW_COOKIE_NAME } from "@/lib/preview-identity";
import { GET as dashboard } from "@/app/api/tob/dashboard/route";
import { GET as listTickets } from "@/app/api/tob/tickets/route";
import { POST as createCustomerTicket } from "@/app/api/toc/tickets/route";
import { signCustomerToken } from "@/lib/auth/customer";
import { GET as searchTickets } from "@/app/api/tob/search/route";
import { GET as suggestTickets } from "@/app/api/tob/search/suggest/route";
import { GET as listTypes } from "@/app/api/tob/admin/ticket-types/route";
import { ensureUnclassifiedType } from "@/services/ticket-types";
import { createTestDb } from "./test-db";

let db: Database;
let sessionUserId: string | null;
const secret = "page-read-preview-test-secret";
vi.mock("@/lib/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db")>(),
  getDb: () => db,
  getEnv: () => ({ AUTH_SECRET: secret }),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null } }),
}));
vi.mock("@/services/ticket-types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ticket-types")>();
  return { ...actual, ensureUnclassifiedType: vi.fn(actual.ensureUnclassifiedType) };
});

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb();
  sessionUserId = "admin";
  await db.insert(tenants).values([{ id: "t1", name: "One" }, { id: "t2", name: "Two" }]);
  await db.insert(products).values([
    { id: "p1", tenantId: "t1", name: "One" },
    { id: "p2", tenantId: "t1", name: "Two" },
    { id: "p3", tenantId: "t2", name: "Other tenant" },
  ]);
  await db.insert(teams).values([
    { id: "team1", tenantId: "t1", name: "One" },
    { id: "team2", tenantId: "t1", name: "Two" },
  ]);
  await db.insert(productTeams).values([{ productId: "p1", teamId: "team1" }, { productId: "p2", teamId: "team2" }]);
  await db.insert(users).values([
    { id: "admin", email: "admin@example.com", displayName: "Admin", tenantId: "t1", role: Role.SuperAdmin },
    { id: "tenant", email: "tenant@example.com", displayName: "Tenant", tenantId: "t1", role: Role.TenantAdmin },
    { id: "product", email: "product@example.com", displayName: "Product", tenantId: "t1", role: Role.ProductAdmin },
    { id: "lead", email: "lead@example.com", displayName: "Lead", tenantId: "t1", role: Role.TeamAdmin },
    { id: "agent", email: "agent@example.com", displayName: "Agent", tenantId: "t1", role: Role.Agent },
  ]);
  await db.insert(agentTeams).values([
    { userId: "product", teamId: "team2" },
    { userId: "lead", teamId: "team1" },
    { userId: "agent", teamId: "team1" },
  ]);
  await db.insert(userProducts).values({ userId: "product", productId: "p1" });
  await db.insert(tickets).values([
    { createdAt: "2026-01-01", updatedAt: "2026-01-01", id: "new", tenantId: "t1", productId: "p1", teamId: "team1", subject: "New", content: "body", status: TicketStatus.New, priority: TicketPriority.High, slaAcceptDeadline: "2000-01-01T00:00:00.000Z" },
    { createdAt: "2026-01-01", updatedAt: "2026-01-01", id: "closed", tenantId: "t1", productId: "p1", teamId: "team1", subject: "Closed", content: "body", status: TicketStatus.Closed, priority: TicketPriority.Medium, slaReplyBreached: true },
    { createdAt: "2026-01-01", updatedAt: "2026-01-01", id: "other", tenantId: "t1", productId: "p2", teamId: "team2", subject: "Other product", content: "body", status: TicketStatus.Escalated, priority: TicketPriority.Medium },
    { createdAt: "2026-01-01", updatedAt: "2026-01-01", id: "foreign", tenantId: "t2", productId: "p3", teamId: "foreign", subject: "Other tenant", content: "body", status: TicketStatus.New, priority: TicketPriority.Medium },
  ]);
  for (const productId of ["p1", "p2", "p3"]) await ensureUnclassifiedType(db, productId);
  vi.mocked(ensureUnclassifiedType).mockClear();
});

const request = (path: string, cookie?: string) => new NextRequest(`https://admin.example.com/api/tob/${path}`, cookie ? { headers: { cookie } } : undefined);

const dashboardSchema = z.object({ ok: z.literal(true), data: z.object({
  stats: z.object({ products: z.number(), overdue: z.number() }),
  recentTickets: z.array(z.object({ id: z.string(), productId: z.string() })),
}) });
const ticketsSchema = z.object({ ok: z.literal(true), data: z.object({
  total: z.number(), totalPages: z.number(), pageSize: z.number(), page: z.number(),
  items: z.array(z.object({ id: z.string(), productId: z.string() })),
}) });
const typesSchema = z.object({ ok: z.literal(true), data: z.array(z.object({ id: z.string(), productId: z.string() })) });

describe("live, batched page reads", () => {
  it.each([
    ["priority", ["new", "foreign", "closed", "other"]],
    ["updated_desc", ["foreign", "closed", "new", "other"]],
    ["updated_asc", ["other", "new", "closed", "foreign"]],
    ["created_desc", ["other", "foreign", "closed", "new"]],
    ["created_asc", ["new", "closed", "foreign", "other"]],
  ])("sorts %s before pagination, with stable ties and live scope", async (sort, expected) => {
    await db.update(tickets).set({ createdAt: "2026-01-02", updatedAt: "2026-01-03" }).where(eq(tickets.id, "closed"));
    await db.update(tickets).set({ createdAt: "2026-01-03", updatedAt: "2025-12-31" }).where(eq(tickets.id, "other"));
    await db.update(tickets).set({ createdAt: "2026-01-02", updatedAt: "2026-01-03" }).where(eq(tickets.id, "foreign"));
    const ids: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const result = ticketsSchema.parse(await (await listTickets(request(`tickets?sort=${sort}&pageSize=1&page=${page}`))).json());
      ids.push(result.data.items[0].id);
    }
    expect(ids).toEqual(expected);
    sessionUserId = "product";
    const scoped = ticketsSchema.parse(await (await listTickets(request(`tickets?sort=${sort}`))).json());
    expect(scoped.data.items.map(row => row.id)).toEqual(expected.filter(id => id === "new" || id === "closed"));
  });

  it("rejects unknown ordering instead of interpolating SQL", async () => {
    expect((await listTickets(request("tickets?sort=createdAt%20DESC"))).status).toBe(400);
  });

  it("returns the allocated numeric number when a customer creates a ticket without optional metadata", async () => {
    await db.update(tenants).set({ defaultTeamId: "team1" }).where(eq(tenants.id, "t1"));
    await db.insert(customers).values({ id: "customer", tenantId: "t1", productId: "p1", email: "customer@example.com", createdAt: "2026-10-12", updatedAt: "2026-10-12" });
    await db.insert(ticketTypes).values({ id: "intake", productId: "p1", level: 1, name: "Support", createdAt: "2026-10-12", updatedAt: "2026-10-12" });
    await db.insert(ticketTemplates).values({ id: "form", ticketTypeId: "intake", currentVersionId: "form-v1", createdAt: "2026-10-12", updatedAt: "2026-10-12" });
    await db.insert(ticketTemplateVersions).values({ id: "form-v1", templateId: "form", version: 1, formSchema: '{"version":"1.0","fields":[]}', createdAt: "2026-10-12" });
    const { token } = await signCustomerToken({ sub: "customer", tenantId: "t1", productId: "p1" });
    const response = await createCustomerTicket(new NextRequest("https://support.example.com/api/toc/tickets", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticketTypeId: "intake", templateVersionId: "form-v1", subject: "Help", content: "Please help" }),
    }));
    expect(response.status).toBe(201);
    const result = z.object({ data: z.object({ ticketId: z.string(), ticketNumber: z.number().positive() }) }).parse(await response.json());
    const row = await db.query.tickets.findFirst({ where: eq(tickets.id, result.data.ticketId) });
    expect(result.data.ticketNumber).toBe(row?.number);
    expect(result.data.ticketNumber).toBe(5);
  });

  it("finds numeric ticket numbers in lists, search and suggestions without expanding live scope", async () => {
    sessionUserId = "product";
    const visible = (await db.query.tickets.findFirst({ where: eq(tickets.id, "new") }))!;
    const foreign = (await db.query.tickets.findFirst({ where: eq(tickets.id, "foreign") }))!;
    for (const number of [visible.number, foreign.number]) {
      const q = encodeURIComponent(`#${number}`);
      const rowsSchema = z.array(z.object({ id: z.string(), number: z.number() }));
      const list = z.object({ data: z.object({ items: rowsSchema }) }).parse(await (await listTickets(request(`tickets?q=${q}&summary=true`))).json());
      const search = z.object({ data: z.object({ tickets: rowsSchema }) }).parse(await (await searchTickets(request(`search?q=${q}`))).json());
      const suggestions = z.object({ data: z.object({ tickets: rowsSchema }) }).parse(await (await suggestTickets(request(`search/suggest?q=${q}`))).json());
      for (const rows of [list.data.items, search.data.tickets, suggestions.data.tickets]) {
        expect(rows.map((row: { id: string }) => row.id)).toEqual(number === visible.number ? [visible.id] : []);
        if (rows.length) expect(rows[0].number).toBe(number);
      }
    }
  });

  it.each([
    ["admin", 4, 3], ["tenant", 3, 2], ["product", 2, 1], ["lead", 2, 1], ["agent", 2, 1],
  ])("preserves %s scope for dashboard and pagination", async (userId, total, productCount) => {
    sessionUserId = userId;
    const summary = dashboardSchema.parse(await (await dashboard(request("dashboard"))).json());
    expect(summary.ok).toBe(true);
    expect(summary.data.stats.products).toBe(productCount);
    expect(summary.data.stats.overdue).toBe(1);
    expect(summary.data.recentTickets).toHaveLength(total);
    const first = ticketsSchema.parse(await (await listTickets(request("tickets?pageSize=1"))).json());
    expect(first.data).toMatchObject({ total, totalPages: total, pageSize: 1, page: 1 });
    expect(first.data.items[0].id).toBe("new");
    const last = ticketsSchema.parse(await (await listTickets(request(`tickets?pageSize=1&page=${total + 1}`))).json());
    expect(last.data.total).toBe(total);
    expect(last.data.items).toEqual([]);
  });

  it("applies membership loss, product reassignment and role changes on the next read", async () => {
    expect((await resolveAuthedContext(db, "product", {}))?.productIds).toEqual(["p1"]);
    await db.delete(userProducts).where(eq(userProducts.userId, "product"));
    expect((await resolveAuthedContext(db, "product", {}))?.productIds).toEqual([]);
    await db.update(users).set({ role: Role.Agent }).where(eq(users.id, "product"));
    expect((await resolveAuthedContext(db, "product", {}))?.productIds).toEqual(["p2"]);
    await db.delete(agentTeams).where(eq(agentTeams.userId, "product"));
    const context = await resolveAuthedContext(db, "product", {});
    expect(context).toMatchObject({ role: Role.Agent, teamIds: [], productIds: [] });
    expect(await resolveAuthedContext(db, "missing", {})).toBeNull();
  });

  it.each(["admin", "tenant", "product", "lead", "agent"])("keeps summary rows in the same %s scope without loading detail content", async (userId) => {
    sessionUserId = userId;
    await db.update(tickets).set({
      content: "Large private body ".repeat(1_000),
      metadata: JSON.stringify({ private: "Form data" }),
      aiScreeningResult: JSON.stringify({ internal: "AI analysis" }),
    });
    const responseSchema = z.object({ data: z.object({ total: z.number(), items: z.array(z.object({ id: z.string(), content: z.string().optional() }).passthrough()) }) });
    const full = responseSchema.parse(await (await listTickets(request("tickets"))).json());
    const summary = responseSchema.parse(await (await listTickets(request("tickets?summary=true"))).json());
    expect(summary.data.total).toBe(full.data.total);
    expect(summary.data.items.map((row: { id: string }) => row.id)).toEqual(full.data.items.map((row: { id: string }) => row.id));
    const fresh = summary.data.items.find((row: { id: string }) => row.id === "new");
    expect(fresh).toMatchObject({ subject: "New", status: "new", priority: "high", updatedAt: "2026-01-01", sla: { acceptBreached: true } });
    for (const row of summary.data.items) {
      expect(row).not.toHaveProperty("content");
      expect(row).not.toHaveProperty("metadata");
      expect(row).not.toHaveProperty("aiScreeningResult");
      expect(row).not.toHaveProperty("subjectTranslations");
    }
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length / 10);
    expect(full.data.items[0].content).toContain("Large private body");
  });

  it("keeps preview reads scoped and rejects preview writes", async () => {
    const cookie = `${PREVIEW_COOKIE_NAME}=${await sealPreviewCookie({ actorId: "admin", targetUserId: "product", exp: Date.now() + 60_000 }, secret)}`;
    const response = await dashboard(request("dashboard", cookie));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = dashboardSchema.parse(await response.json());
    expect(result.data.stats.products).toBe(1);
    expect(result.data.recentTickets.map((ticket: { productId: string }) => ticket.productId)).toEqual(["p1", "p1"]);
    const write = withAuth({}, async () => ok({ written: true }));
    const denied = await write(new NextRequest("https://admin.example.com/api/tob/tickets/new", { method: "PATCH", headers: { cookie } }));
    expect(denied.status).toBe(403);
  });

  it("rejects unauthenticated requests and filters cannot expand scope", async () => {
    sessionUserId = null;
    expect((await dashboard(request("dashboard"))).status).toBe(401);
    sessionUserId = "product";
    const result = ticketsSchema.parse(await (await listTickets(request("tickets?productId=p2"))).json());
    expect(result.data).toMatchObject({ items: [], total: 0 });
  });
});

describe("product-scoped type loading", () => {
  it("returns only the requested product without per-product fallback queries", async () => {
    const result = typesSchema.parse(await (await listTypes(request("admin/ticket-types?productId=p1"))).json());
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].productId).toBe("p1");
    expect(ensureUnclassifiedType).not.toHaveBeenCalled();
  });

  it("preserves the unfiltered catalogue and repairs only missing fallbacks", async () => {
    await db.delete(ticketTypes).where(and(eq(ticketTypes.productId, "p2"), eq(ticketTypes.systemKey, "unclassified")));
    const result = typesSchema.parse(await (await listTypes(request("admin/ticket-types"))).json());
    expect(result.data).toHaveLength(3);
    expect(ensureUnclassifiedType).toHaveBeenCalledExactlyOnceWith(db, "p2");
    expect(new Set(result.data.map((type: { productId: string }) => type.productId)).size).toBe(3);
  });

  it.each(["p2", "p3", "missing"])("cannot read inaccessible product %s by filtering", async (productId) => {
    sessionUserId = "product";
    const result = typesSchema.parse(await (await listTypes(request(`admin/ticket-types?productId=${productId}`))).json());
    expect(result.data).toEqual([]);
    expect(ensureUnclassifiedType).not.toHaveBeenCalled();
  });
});
