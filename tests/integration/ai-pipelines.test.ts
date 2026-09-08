import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiChatMessages, aiUsageDaily, aiUsageEvents, products, replies, tenants, tickets, users } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import type { AuthedContext } from "@/lib/api/handler";
import { Role, TicketStatus, TicketPriority } from "@/lib/types";
import { createTestDb, NOW, uid } from "./test-db";

const mocks = vi.hoisted(() => ({ getAIProvider: vi.fn(), complete: vi.fn() }));
vi.mock("@/services/ai/config", () => ({ getAIProvider: mocks.getAIProvider }));
vi.mock("@/services/ai/embedding", () => ({ findRelevantKnowledge: vi.fn(async () => []) }));

import { prescreenTicket } from "@/services/ai/prescreening";
import { generatePrereply } from "@/services/ai/prereply";
import { assertAgentSessionAccess, chatWithAgent, getChatHistory } from "@/services/ai/agent";
import { recordAiUsage, purgeExpiredAiUsage, saveUsageSettings } from "@/services/ai/usage";

let db: Database;
let ticketId: string;
let tenantId: string;
let productId: string;
const activityAt = "2026-01-01T00:00:00.000Z";

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.getAIProvider.mockResolvedValue({ complete: mocks.complete });
  db = await createTestDb();
  tenantId = uid("tenant");
  productId = uid("product");
  ticketId = uid("ticket");
  await db.insert(tenants).values({ id: tenantId, name: "Tenant" });
  await db.insert(products).values({ id: productId, tenantId, name: "Product" });
  await db.insert(tickets).values({
    id: ticketId, tenantId, productId, teamId: "team-1", subject: "Help",
    content: "Customer request", customerLanguage: "zh", status: TicketStatus.Replied, priority: TicketPriority.Medium,
    createdAt: activityAt, updatedAt: activityAt,
  });
});

describe("AI ticket pipelines", () => {
  it("rejects malformed prescreening without persisting corrupt insight arrays", async () => {
    mocks.complete.mockResolvedValue({ content: '{"issues":"wrong","keywords":[42]}' });
    await expect(prescreenTicket(db, ticketId)).rejects.toThrow();
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    expect(ticket?.aiScreeningStatus).toBe("error");
    expect(ticket?.aiExtractedIssues).toBeNull();
    expect(ticket?.updatedAt).toBe(activityAt);
  });

  it("stores validated screening without postponing ticket inactivity", async () => {
    mocks.complete.mockResolvedValue({ content: '{"issues":["Broken"],"keywords":["login"]}' });
    await prescreenTicket(db, ticketId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    expect(ticket?.aiScreeningStatus).toBe("completed");
    expect(ticket?.aiExtractedIssues).toBe('["Broken"]');
    expect(ticket?.updatedAt).toBe(activityAt);
  });

  it("excludes internal notes before limiting prereply context and defaults to the customer language", async () => {
    await db.insert(replies).values([
      { id: uid("reply"), ticketId, content: "Public customer follow-up", createdAt: activityAt },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: uid("note"), ticketId, senderId: "agent", internal: true,
        content: `Internal confidential note ${index}`, createdAt: NOW(),
      })),
    ]);
    mocks.complete.mockResolvedValue({ content: "您好，请重试。" });
    await generatePrereply(db, { ticketId });
    const request = mocks.complete.mock.calls[0][0];
    expect(request.messages[0].content).toContain("Language: Chinese");
    expect(request.messages[1].content).toContain("Customer: Public customer follow-up");
    expect(request.messages[1].content).not.toContain("confidential");
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    expect(ticket?.aiSuggestedReply).toBe("您好，请重试。");
    expect(ticket?.updatedAt).toBe(activityAt);
  });

  it("does not leave phantom user messages after a provider failure", async () => {
    mocks.complete.mockRejectedValue(new Error("offline"));
    await expect(chatWithAgent(db, {
      userId: "user", sessionId: `ticket-${ticketId}`, ticketId, message: "Help me",
    })).rejects.toThrow("offline");
    expect(await db.select().from(aiChatMessages)).toHaveLength(0);
    mocks.complete.mockResolvedValue({ content: "Try again" });
    await chatWithAgent(db, {
      userId: "user", sessionId: `ticket-${ticketId}`, ticketId, message: "Help me",
    });
    expect(await db.select().from(aiChatMessages)).toHaveLength(2);
  });

  it("returns the newest history window in chronological order", async () => {
    await db.insert(aiChatMessages).values(Array.from({ length: 55 }, (_, index) => ({
      id: uid("message"), userId: "user", sessionId: `ticket-${ticketId}`,
      role: "user" as const, content: String(index),
      createdAt: new Date(Date.parse(activityAt) + index * 1000).toISOString(),
    })));
    const history = await getChatHistory(db, "user", `ticket-${ticketId}`);
    expect(history).toHaveLength(50);
    expect(history[0].content).toBe("5");
    expect(history.at(-1)?.content).toBe("54");
  });

  it("rechecks live ticket scope for existing sessions and prevents cross-ticket reuse", async () => {
    const userId = uid("user");
    await db.insert(users).values({ id: userId, tenantId, displayName: "Agent", email: `${userId}@example.com`, role: Role.Agent });
    const user = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
    const ctx: AuthedContext = {
      db, user, role: Role.Agent, isSuperAdmin: false, tenantIds: [tenantId],
      teamIds: ["team-1"], productIds: [productId], params: {},
    };
    await expect(assertAgentSessionAccess(ctx, `ticket-${ticketId}`)).resolves.toBe(ticketId);
    await expect(assertAgentSessionAccess(ctx, `ticket-${ticketId}`, "other-ticket")).rejects.toThrow(/does not match/);
    await expect(assertAgentSessionAccess(ctx, "unbound-session", ticketId)).rejects.toThrow(/ticket session/);
    ctx.teamIds = [];
    await expect(assertAgentSessionAccess(ctx, `ticket-${ticketId}`)).rejects.toThrow();
  });
});

describe("AI usage attribution and retention", () => {
  it("hydrates the owning tenant for product-only calls and rejects caller misattribution", async () => {
    await recordAiUsage(db, {
      credentialId: "credential", taskType: "embedding", productId,
      tenantId: "wrong-tenant", model: "embedding-model", provider: "openai",
      promptTokens: 0, completionTokens: 0, totalTokens: 17, success: true,
    });
    const events = await db.select().from(aiUsageEvents);
    expect(events[0].tenantId).toBe(tenantId);
    const daily = await db.select().from(aiUsageDaily);
    expect(daily.map((row) => row.dimension).sort()).toEqual(["product", "system", "tenant"]);
    expect(daily.find((row) => row.dimension === "tenant")?.tenantId).toBe(tenantId);
  });

  it("purges tenant aggregates and tenant-only events even for tenants without products", async () => {
    await db.delete(products).where(eq(products.id, productId));
    await recordAiUsage(db, {
      credentialId: "credential", taskType: "agent", tenantId,
      model: "text-model", provider: "openai", promptTokens: 3,
      completionTokens: 4, totalTokens: 7, success: true,
    });
    await db.update(aiUsageEvents).set({ createdAt: activityAt });
    await db.update(aiUsageDaily).set({ day: activityAt.slice(0, 10) });
    await saveUsageSettings(db, { scope: "tenant", tenantId }, { retentionDays: 1 });
    await purgeExpiredAiUsage(db);
    expect(await db.select().from(aiUsageEvents)).toHaveLength(0);
    const daily = await db.select().from(aiUsageDaily);
    expect(daily.map((row) => row.dimension)).toEqual(["system"]);
  });
});
