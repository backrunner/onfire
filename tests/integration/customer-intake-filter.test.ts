import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { aiConfigs, aiCredentials, aiTaskCredentials, customers, history, products, replies, spamFilterConfigs, teams, tenants, tickets, ticketTemplates, ticketTemplateVersions, ticketTypes } from "@/drizzle/schema";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { signCustomerToken } from "@/lib/auth/customer";
import { sealSecret } from "@/lib/secret-storage";
import { POST as createTicket } from "@/app/api/toc/tickets/route";
import { POST as reply } from "@/app/api/toc/tickets/[id]/reply/route";
import { createTestDb, NOW } from "./test-db";

let db: Database;
let token: string;
const secret = "customer-intake-filter-test";
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: secret }) }));
vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  db = await createTestDb();
  await db.insert(tenants).values({ id: "t", name: "Tenant", defaultTeamId: "team" });
  await db.insert(teams).values({ id: "team", tenantId: "t", name: "Team" });
  await db.insert(products).values({ id: "p", tenantId: "t", name: "Product" });
  await db.insert(customers).values({ id: "c", tenantId: "t", productId: "p", email: "customer@example.com", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(ticketTypes).values({ id: "type", productId: "p", level: 1, name: "Support", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(ticketTemplates).values({ id: "form", ticketTypeId: "type", currentVersionId: "version", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(ticketTemplateVersions).values({ id: "version", templateId: "form", version: 1, formSchema: '{"version":"1.0","fields":[]}', createdAt: NOW() });
  await db.insert(aiCredentials).values({ id: "jev", name: "Jev", provider: "typesafe", apiKey: await sealSecret("test-key", secret, "ai-credential:jev"), secretPurpose: "ai-credential:jev", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(aiConfigs).values({ id: "spam", taskType: "spam", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(aiTaskCredentials).values({ id: "route", credentialId: "jev", taskType: "spam", model: "jev-latest", modelKind: "decision", createdAt: NOW(), updatedAt: NOW() });
  await db.insert(spamFilterConfigs).values({ id: "filter", scopeKey: "global", scope: "global", mode: "custom", provider: "ai", createdAt: NOW(), updatedAt: NOW() });
  token = (await signCustomerToken({ sub: "c", tenantId: "t", productId: "p" })).token;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const response = (spam = 0.01, support = 0.99) => Response.json({ model: "jev-1.13.0", answers: { spam: { type: "noul", noul: spam }, support: { type: "noul", noul: support } }, usage: { input_tokens: 100, output_tokens: 10 } });
const request = (body: object, id?: string, lang = "en") => new NextRequest(`https://support.example.com/api/toc/tickets${id ? `/${id}/reply` : ""}`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "accept-language": lang }, body: JSON.stringify(body),
});
const submit = (content = "Please help me sign in", lang = "en") => createTicket(request({ ticketTypeId: "type", templateVersionId: "version", subject: "Cannot sign in", content }, undefined, lang));

describe("customer admission filtering before persistence", () => {
  it.each(["推广广告", "合作邀约", "乱码 asdfqwer", "无意义的填充内容", "无关话题"])("blocks %s when support intent is absent despite low spam probability", async (content) => {
    fetchMock.mockResolvedValue(response(0.01, 0.01));
    expect((await submit(content)).status).toBe(400);
    expect(await db.select().from(tickets)).toHaveLength(0);
    expect(await db.select().from(history)).toHaveLength(0);
  });
  it("blocks uncertainty and preserves bilingual rejection messages", async () => {
    fetchMock.mockResolvedValue(response(0.01, 0.5));
    const result = await submit("unclear", "zh");
    expect(result.status).toBe(400);
    expect(await result.text()).toContain("真实的支持请求");
    expect(await db.select().from(tickets)).toHaveLength(0);
  });
  it("returns a retryable error without inserting when verification fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    const result = await submit();
    expect(result.status).toBe(503);
    expect(await db.select().from(tickets)).toHaveLength(0);
    expect(await db.select().from(history)).toHaveLength(0);
  });
  it("admits genuine support and contextual thanks without exposing internal notes", async () => {
    fetchMock.mockResolvedValue(response());
    const created = await submit();
    expect(created.status).toBe(201);
    const id = z.object({ data: z.object({ ticketId: z.string() }) }).parse(await created.json()).data.ticketId;
    await db.update(tickets).set({ status: TicketStatus.Replied }).where(eq(tickets.id, id));
    await db.insert(replies).values([
      { id: "public", ticketId: id, content: "Please reset your password", internal: false, createdAt: "2026-10-10" },
      { id: "private", ticketId: id, content: "INTERNAL SECRET", internal: true, createdAt: "2026-10-11" },
    ]);
    fetchMock.mockClear(); fetchMock.mockResolvedValue(response());
    expect((await reply(request({ content: "谢谢，已经解决了" }, id), { params: Promise.resolve({ id }) })).status).toBe(200);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.state.message).toMatchObject({ kind: "reply", content: "谢谢，已经解决了", ticketContext: { subject: "Cannot sign in", latestReply: "Please reset your password" } });
    expect(JSON.stringify(body)).not.toContain("INTERNAL SECRET");
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, id) }))?.status).toBe(TicketStatus.Processing);
  });
  it("does not reopen or write a rejected customer reply", async () => {
    await db.insert(tickets).values({ id: "owned", tenantId: "t", productId: "p", teamId: "team", customerId: "c", subject: "Help", content: "Issue", status: TicketStatus.Replied, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: "2026-10-01" });
    fetchMock.mockResolvedValue(response(0.01, 0.01));
    expect((await reply(request({ content: "buy our product" }, "owned"), { params: Promise.resolve({ id: "owned" }) })).status).toBe(400);
    expect(await db.select().from(replies)).toHaveLength(0);
    expect(await db.select().from(history)).toHaveLength(0);
    expect(await db.query.tickets.findFirst()).toMatchObject({ status: TicketStatus.Replied, updatedAt: "2026-10-01" });
  });
});
