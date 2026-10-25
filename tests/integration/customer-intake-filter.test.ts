import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { filteredInputs, inboundEmails, users, aiConfigs, aiCredentials, aiTaskCredentials, customers, history, products, replies, spamFilterConfigs, teams, tenants, tickets, ticketTemplates, ticketTemplateVersions, ticketTypes } from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import { signCustomerToken } from "@/lib/auth/customer";
import { sealSecret } from "@/lib/secret-storage";
import { POST as createTicket } from "@/app/api/toc/tickets/route";
import { POST as reply } from "@/app/api/toc/tickets/[id]/reply/route";
import { GET as listInputs } from "@/app/api/tob/admin/spam-filter/inputs/route";
import { GET as getInput } from "@/app/api/tob/admin/spam-filter/inputs/[source]/[id]/route";
import { POST as restoreInput } from "@/app/api/tob/admin/spam-filter/inputs/[source]/[id]/release/route";
import { sealPreviewCookie, PREVIEW_COOKIE_NAME } from "@/lib/preview-identity";
import * as translationService from "@/services/ticket-translation";
import { emitTicketEvent } from "@/services/ticket-events";
import { createTestDb, NOW } from "./test-db";

let db: Database;
let token: string;
let actorId: string | null = "admin";
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => actorId ? { user: { id: actorId } } : null } }) }));
const secret = "customer-intake-filter-test";
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: secret }) }));
vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  db = await createTestDb(); actorId = "admin";
  await db.insert(users).values([
    { id: "admin", email: "admin@test.example", displayName: "Admin", role: Role.SuperAdmin, tenantId: "t" },
    { id: "tenant-admin", email: "tenant@test.example", displayName: "Tenant admin", role: Role.TenantAdmin, tenantId: "t" },
    { id: "product-admin", email: "product@test.example", displayName: "Product admin", role: Role.ProductAdmin, tenantId: "t" },
  ]);
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

const listResult = z.object({ data: z.object({ total: z.number(), items: z.array(z.object({ id: z.string(), productId: z.string(), ticketNumber: z.number().nullable() }).passthrough()) }) });
const restoreResult = z.object({ data: z.object({ ticketId: z.string(), ticketNumber: z.number(), replyId: z.string().nullable() }) });
const adminRequest = (suffix = "", body?: object) => new NextRequest(`https://admin.example.com/api/tob/admin/spam-filter/inputs${suffix}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = (id: string, source = "web") => ({ params: Promise.resolve({ id, source }) });
const restore = (id: string, source = "web", body: object = { reason: "Reviewed: genuine support" }) => restoreInput(adminRequest(`/${source}/${id}/release`, body), params(id, source));
async function held() { fetchMock.mockResolvedValue(response(0.99, 0.01)); expect((await submit()).status).toBe(400); return (await db.query.filteredInputs.findFirst())!; }
async function seedMail(id = "mail", productId = "p", createdAt = NOW()) {
  await db.insert(inboundEmails).values({ id, productId, messageId: id, provider: "generic", fromEmail: "customer@example.com", toEmail: "help@example.com", subject: "A real issue", bodyHtml: '<p>Cannot sign in</p><script>alert(1)</script><img src="https://tracker.example/pixel"><img src="/api/attachments/abcdef123456">', processingStatus: "quarantined", filterReason: "Flagged", filterStage: "local", createdAt });
}

describe("filtered input review and restoration", () => {
  it("retains complete valid rejected intake but no token, ticket, history or notification", async () => {
    const row = await held();
    expect(row).toMatchObject({ customerId: "c", subject: "Cannot sign in", content: "Please help me sign in", ticketTypeId: "type", templateVersionId: "version", filterVerdict: "spam", filterProvider: "typesafe", releasedAt: null });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(emitTicketEvent).not.toHaveBeenCalled();
  });
  it("preserves unavailable verification and malformed forms never enter quarantine", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await submit()).status).toBe(503);
    expect(await db.query.filteredInputs.findFirst()).toMatchObject({ filterVerdict: "unavailable" });
    expect((await createTicket(request({ ticketTypeId: "foreign", templateVersionId: "version", subject: "Invalid", content: "Bad" }))).status).toBe(400);
    expect(await db.select().from(filteredInputs)).toHaveLength(1);
  });
  it("merges scoped recent mail and web rows with stable pagination and no body payload", async () => {
    const row = await held(); await seedMail(); await seedMail("old", "p", "2020-01-01");
    await db.insert(tenants).values({ id: "foreign", name: "Foreign" });
    await db.insert(products).values({ id: "foreign", tenantId: "foreign", name: "Foreign" });
    await seedMail("foreign", "foreign"); actorId = "tenant-admin";
    const first = await listInputs(adminRequest("?pageSize=1")); expect(first.status).toBe(200);
    const a = listResult.parse(await first.json()); const b = listResult.parse(await (await listInputs(adminRequest("?pageSize=1&page=2"))).json());
    expect(a.data.total).toBe(2); expect(a.data.items[0].productId).toBe("p"); expect(b.data.items[0].productId).toBe("p"); expect(a.data.items[0].id).not.toBe(b.data.items[0].id);
    expect(a.data.items[0]).not.toHaveProperty("content"); expect(a.data.items[0]).not.toHaveProperty("filterResult");
    expect((await getInput(adminRequest(), params(row.id))).status).toBe(200);
    expect((await getInput(adminRequest(), params("foreign", "email"))).status).toBe(404);
    expect((await restore("foreign", "email")).status).toBe(404);
    expect((await listInputs(adminRequest("?tenantId=foreign"))).status).toBe(404);
    actorId = "product-admin"; expect((await listInputs(adminRequest())).status).toBe(403);
    expect((await restore(row.id)).status).toBe(403);
    actorId = null; expect((await listInputs(adminRequest())).status).toBe(401);
  });
  it("blocks restoration while previewing another administrator", async () => {
    const row = await held();
    const preview = await sealPreviewCookie({ actorId: "admin", targetUserId: "tenant-admin", exp: Date.now() + 60000 }, secret);
    const req = adminRequest(`/web/${row.id}/release`, { reason: "Review" }); req.cookies.set(PREVIEW_COOKIE_NAME, preview);
    expect((await restoreInput(req, params(row.id))).status).toBe(403);
    expect(await db.select().from(tickets)).toHaveLength(0);
  });
  it("keeps translation failures pending and rolls back stale reply restoration", async () => {
    const row = await held();
    vi.spyOn(translationService, "prepareTicketTranslation").mockRejectedValueOnce(new Error("fixture outage"));
    expect((await restore(row.id)).status).toBe(503);
    expect((await db.query.filteredInputs.findFirst())?.releasedAt).toBeNull();
    expect(await db.select().from(tickets)).toHaveLength(0);
    await db.insert(tickets).values({ id: "owned", tenantId: "t", productId: "p", teamId: "team", customerId: "c", subject: "Help", content: "Issue", status: TicketStatus.Replied, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: NOW() });
    await reply(request({ content: "Thanks" }, "owned"), params("owned"));
    const heldReply = (await db.query.filteredInputs.findFirst({ where: eq(filteredInputs.ticketId, "owned") }))!;
    const original = translationService.prepareReplyTranslation;
    vi.spyOn(translationService, "prepareReplyTranslation").mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      await db.update(tickets).set({ status: TicketStatus.Closed }).where(eq(tickets.id, "owned"));
      return result;
    });
    expect((await restore(heldReply.id)).status).toBe(409);
    expect(await db.select().from(replies)).toHaveLength(0); expect(await db.select().from(history)).toHaveLength(0);
    expect((await db.query.filteredInputs.findFirst({ where: eq(filteredInputs.id, heldReply.id) }))?.releasedAt).toBeNull();
  });
  it("restores a ticket exactly once under concurrent retry with audited creation and current contact", async () => {
    const row = await held(); fetchMock.mockClear();
    await db.update(customers).set({ email: "current@example.com" }).where(eq(customers.id, "c"));
    const responses = await Promise.all([restore(row.id), restore(row.id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const a = restoreResult.parse(await responses[0].json()); const b = restoreResult.parse(await responses[1].json()); expect(a.data).toEqual(b.data);
    expect(a.data.ticketNumber).toBeGreaterThan(0);
    expect(await db.select().from(tickets)).toHaveLength(1); expect(await db.select().from(history)).toHaveLength(1);
    expect(await db.query.tickets.findFirst()).toMatchObject({ customerEmail: "current@example.com", ticketTypeId: "type", templateVersionId: "version", teamId: "team", source: "api" });
    expect(await db.query.history.findFirst()).toMatchObject({ actorId: "admin", action: "created" });
    expect(await db.query.filteredInputs.findFirst()).toMatchObject({ restoredTicketId: a.data.ticketId, releasedBy: "admin", releaseReason: "Reviewed: genuine support" });
    expect(emitTicketEvent).toHaveBeenCalledTimes(1); expect(fetchMock).not.toHaveBeenCalled();
    expect((await restore(row.id)).status).toBe(200); expect(emitTicketEvent).toHaveBeenCalledTimes(1);
    const pending = listResult.parse(await (await listInputs(adminRequest("?state=pending"))).json()); expect(pending.data.total).toBe(0);
    const released = listResult.parse(await (await listInputs(adminRequest("?state=released"))).json()); expect(released.data.items[0].ticketNumber).toBe(a.data.ticketNumber);
  });
  it("keeps failed restoration reviewable and rejects an empty audit reason", async () => {
    const row = await held(); expect((await restore(row.id, "web", { reason: " " })).status).toBe(400);
    await db.update(ticketTemplateVersions).set({ invalidatedAt: NOW() }).where(eq(ticketTemplateVersions.id, "version"));
    expect((await restore(row.id)).status).toBe(409);
    expect(await db.select().from(tickets)).toHaveLength(0); expect(await db.select().from(history)).toHaveLength(0);
    expect((await db.query.filteredInputs.findFirst())?.releasedAt).toBeNull();
  });
  it("restores sanitized customer replies to the original ticket once", async () => {
    await db.insert(tickets).values({ id: "owned", tenantId: "t", productId: "p", teamId: "team", customerId: "c", subject: "Help", content: "Issue", status: TicketStatus.Replied, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: NOW() });
    fetchMock.mockResolvedValue(response(0.99, 0.01));
    expect((await reply(request({ content: "Fixed, thanks", contentHtml: '<p><strong>Fixed</strong>, thanks</p><script>alert(1)</script>' }, "owned"), params("owned"))).status).toBe(400);
    const row = (await db.query.filteredInputs.findFirst())!;
    expect(row.contentHtml).not.toContain("script");
    const responses = await Promise.all([restore(row.id), restore(row.id)]); expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await db.select().from(replies)).toHaveLength(1); expect(await db.select().from(history)).toHaveLength(1);
    expect(await db.query.replies.findFirst()).toMatchObject({ ticketId: "owned", content: "Fixed, thanks", internal: false, source: "web" });
    expect(await db.query.tickets.findFirst()).toMatchObject({ status: TicketStatus.Processing, slaReplyDeadline: null });
    expect(emitTicketEvent).toHaveBeenCalledTimes(1);
  });
  it("refuses restoration to closed tickets and to a different customer", async () => {
    await db.insert(tickets).values({ id: "owned", tenantId: "t", productId: "p", teamId: "team", customerId: "c", subject: "Help", content: "Issue", status: TicketStatus.Replied, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: NOW() });
    fetchMock.mockResolvedValue(response(0.99, 0.01));
    await reply(request({ content: "Thanks" }, "owned"), params("owned"));
    const row = (await db.query.filteredInputs.findFirst())!;
    await db.update(tickets).set({ status: TicketStatus.Closed }).where(eq(tickets.id, "owned"));
    expect((await restore(row.id)).status).toBe(400);
    await db.update(tickets).set({ status: TicketStatus.Processing, customerId: "another" }).where(eq(tickets.id, "owned"));
    expect((await restore(row.id)).status).toBe(404);
    expect(await db.select().from(replies)).toHaveLength(0); expect((await db.query.filteredInputs.findFirst())?.releasedAt).toBeNull();
  });
  it("leaves a released email reply quarantined if its ticket closes during translation", async () => {
    await seedMail();
    await db.insert(tickets).values({ id: "owned", tenantId: "t", productId: "p", teamId: "team", customerId: "c", subject: "Help", content: "Issue", status: TicketStatus.Replied, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: NOW() });
    await db.update(inboundEmails).set({ candidateTicketId: "owned" }).where(eq(inboundEmails.id, "mail"));
    const original = translationService.prepareReplyTranslation;
    vi.spyOn(translationService, "prepareReplyTranslation").mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      await db.update(tickets).set({ status: TicketStatus.Closed }).where(eq(tickets.id, "owned"));
      return result;
    });
    expect((await restore("mail", "email")).status).toBe(400);
    expect(await db.query.inboundEmails.findFirst()).toMatchObject({ processingStatus: "quarantined", releasedAt: null });
    expect(await db.select().from(replies)).toHaveLength(0); expect(await db.select().from(history)).toHaveLength(0);
  });
  it("shows inert email text and reuses typed email release with a required product-owned type", async () => {
    await seedMail();
    const detail = z.object({ data: z.object({ content: z.string(), reviewHtml: z.string(), needsTicketType: z.boolean() }).passthrough() }).parse(await (await getInput(adminRequest(), params("mail", "email"))).json());
    expect(detail.data.content).toContain("Cannot sign in"); expect(detail.data.content).not.toContain("<script");
    expect(detail.data.reviewHtml).not.toContain("<script"); expect(detail.data.reviewHtml).not.toContain("<img");
    expect(detail.data.reviewImages).toEqual([{ src: "https://tracker.example/pixel", alt: "", remote: true }, { src: "/api/attachments/abcdef123456", alt: "", remote: false }]);
    expect(detail.data).not.toHaveProperty("rawPayload"); expect(detail.data.needsTicketType).toBe(true);
    expect((await restore("mail", "email")).status).toBe(400);
    expect((await restore("mail", "email", { reason: "False positive", ticketTypeId: "foreign" })).status).toBe(400);
    const released = await restore("mail", "email", { reason: "False positive", ticketTypeId: "type" });
    expect(released.status).toBe(200); expect(restoreResult.parse(await released.json()).data.ticketNumber).toBeGreaterThan(0);
    expect((await restore("mail", "email")).status).toBe(200);
    expect(await db.select().from(tickets)).toHaveLength(1);
  });
});
