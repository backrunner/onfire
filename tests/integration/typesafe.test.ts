import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiConfigs, aiCredentials, aiTaskCredentials, aiUsageDaily, aiUsageEvents, products, tenants, tickets } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import type { Database } from "@/lib/db";
import { TypeSafeProvider } from "@/services/ai/providers/typesafe";
import type { AIScreeningOptions } from "@/services/ai/providers";
import { classifyInboundEmail, shouldRejectEmail } from "@/services/ai/email-filter";
import { prescreenTicket } from "@/services/ai/prescreening";
import { getAIProvider, hasConfiguredAITask } from "@/services/ai/config";
import { saveTaskRouting } from "@/app/api/tob/admin/ai/config/shared";
import { createTestDb, NOW } from "./test-db";

vi.mock("@/lib/db", () => ({ getEnv: () => ({ AUTH_SECRET: "test-only" }) }));
vi.mock("@/lib/secret-storage", () => ({ openStoredSecret: async () => "fake-api-key" }));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const options: AIScreeningOptions = {
  kind: "email", fromEmail: "customer@example.com", subject: "无法登录", content: "My login is broken. Please help.",
  candidates: [{ id: "login-type", path: "Technical / Account", description: "Login problems" }],
  completion: { messages: [] },
};
const emailInput = { fromEmail: "customer@example.com", subject: options.subject, content: options.content };
const provider = () => new TypeSafeProvider({ provider: "typesafe", model: "jev-latest", apiKey: "fake-api-key" });
const noul = (value: number) => ({ type: "noul" as const, noul: value });
const choice = (value: string, probabilities: Record<string, number>, confidence = 0.9) => ({
  type: "choice" as const, choice: value, probabilities, confidence,
});
function fixture() {
  return {
    model: "jev-1.13.0",
    answers: {
      spam: noul(0.01), support: noul(0.99),
      category: choice("account", { account: 1, billing: 0, technical: 0, performance: 0, data: 0, security: 0, feature_request: 0, how_to: 0, other: 0 }),
      sentiment: choice("negative", { positive: 0, neutral: 0.1, negative: 0.9 }),
      urgency: choice("medium", { low: 0.1, medium: 0.8, high: 0.1 }),
      label_account: noul(0.99), label_billing: noul(0.02), label_technical: noul(0.95),
      label_performance: noul(0.1), label_data: noul(0.01), label_security: noul(0.1),
      label_feature_request: noul(0.1), label_how_to: noul(0.2),
      ticket_type: choice("type_0", { none: 0.05, type_0: 0.95 }),
    },
    usage: { input_tokens: 320, output_tokens: 40 },
  };
}

describe("TypeSafe HTTP protocol", () => {
  it("batches typed questions and maps choices to locally owned candidate IDs", async () => {
    fetchMock.mockResolvedValue(Response.json(fixture()));
    const result = await provider().screen(options);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: { Authorization: "Bearer fake-api-key" } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const request = JSON.parse(String(init?.body));
    expect(request).not.toHaveProperty("messages");
    expect(request.state.message.subject).toBe("无法登录");
    expect(request.questions.spam.type).toBe("noul");
    expect(request.questions.ticket_type.criteria).toEqual({ none: expect.any(String), type_0: "Technical / Account: Login problems" });
    expect(Object.keys(request.questions)).toHaveLength(14);
    const content = JSON.parse(result.content);
    expect(content).toMatchObject({ ticketTypeId: "login-type", typeConfidence: 0.9, keywords: ["account", "technical"], issues: [], decision: { model: "jev-1.13.0" } });
    expect(content).not.toHaveProperty("summary");
    expect(result.usage).toEqual({ promptTokens: 320, completionTokens: 40, totalTokens: 360 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps no-match and uncertain choices from making unsupported selections", async () => {
    const response = fixture();
    response.answers.ticket_type = choice("none", { none: 0.9, type_0: 0.1 });
    response.answers.sentiment.confidence = 0.4;
    fetchMock.mockResolvedValue(Response.json(response));
    const result = JSON.parse((await provider().screen(options)).content);
    expect(result.ticketTypeId).toBeUndefined();
    expect(result.typeConfidence).toBe(0);
    expect(result.sentiment).toBeUndefined();
    expect(result.decision.answers.sentiment.confidence).toBe(0.4);
  });

  it.each([
    (r: ReturnType<typeof fixture>) => { r.answers.spam.noul = 2; },
    (r: ReturnType<typeof fixture>) => { r.answers.spam.noul = Number.NaN; },
    (r: ReturnType<typeof fixture>) => { Reflect.deleteProperty(r.answers, "support"); },
    (r: ReturnType<typeof fixture>) => { Object.assign(r.answers, { support: { type: "choice", choice: "yes" } }); },
    (r: ReturnType<typeof fixture>) => { r.answers.ticket_type.choice = "foreign-type"; },
    (r: ReturnType<typeof fixture>) => { r.answers.ticket_type.probabilities = { none: 0.1, foreign: 0.9 }; },
    (r: ReturnType<typeof fixture>) => { r.answers.ticket_type.probabilities = { none: 0.1, type_0: 0.2 }; },
    (r: ReturnType<typeof fixture>) => { r.answers.ticket_type.choice = "none"; },
    (r: ReturnType<typeof fixture>) => { r.usage.input_tokens = -1; },
  ])("rejects malformed successful responses (%#)", async (mutate) => {
    const response = fixture(); mutate(response);
    fetchMock.mockResolvedValue(Response.json(response));
    await expect(provider().screen(options)).rejects.toThrow(/TypeSafe/);
  });

  it.each([302, 307, 308, 401, 429, 529])("reports HTTP %s without exposing echoed secrets", async (status) => {
    fetchMock.mockResolvedValue(new Response("fake-api-key private customer content", { status }));
    await expect(provider().screen(options)).rejects.toThrow(`TypeSafe screening failed (HTTP ${status})`);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bounds response size and preserves network failures for credential failover", async () => {
    fetchMock.mockResolvedValueOnce(new Response(" ".repeat(256 * 1024 + 1)));
    await expect(provider().screen(options)).rejects.toThrow(/too large/);
    fetchMock.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await expect(provider().screen(options)).rejects.toThrow(/Timed out/);
  });

  it("hides malformed JSON fragments and supports a TypeSafe-compatible gateway", async () => {
    const gateway = new TypeSafeProvider({ provider: "typesafe", model: "jev-1.13.0", apiKey: "fake-api-key", baseUrl: "https://gateway.example.com/typesafe/v1/" });
    fetchMock.mockResolvedValueOnce(new Response("fake-api-key echoed in invalid JSON"));
    await expect(gateway.screen(options)).rejects.toThrow("Invalid TypeSafe screening response (unreadable or too large)");
    expect(fetchMock.mock.calls[0][0]).toBe("https://gateway.example.com/typesafe/v1/systemone");
  });

  it("fails oversized state before fetching and never truncates candidate coverage", async () => {
    await expect(provider().screen({ ...options, content: "中".repeat(9000) })).rejects.toThrow(/budget/);
    await expect(provider().screen({ ...options, candidates: Array.from({ length: 255 }, (_, i) => ({ id: String(i), path: "Support" })) })).rejects.toThrow(/255-choice budget/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe endpoints and unsupported generative calls", async () => {
    expect(() => new TypeSafeProvider({ provider: "typesafe", model: "jev-latest", apiKey: "fake", baseUrl: "http://localhost" })).toThrow(/Unsafe/);
    await expect(provider().complete()).rejects.toThrow(/not text generation/);
    await expect(provider().embed()).rejects.toThrow(/embeddings/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function seedRoute(db: Database, fallback = true) {
  await db.insert(aiConfigs).values({ id: "config", taskType: "prescreening", createdAt: NOW(), updatedAt: NOW() });
  for (const [priority, id] of (fallback ? ["typesafe", "openai"] : ["typesafe"]).entries()) {
    await db.insert(aiCredentials).values({ id, name: id, provider: id as "typesafe" | "openai", apiKey: "sealed", secretPurpose: id, createdAt: NOW(), updatedAt: NOW() });
    await db.insert(aiTaskCredentials).values({
      id, credentialId: id, taskType: "prescreening", model: id === "typesafe" ? "jev-latest" : "gpt-5.4-mini",
      modelKind: id === "typesafe" ? "decision" : "text", priority, createdAt: NOW(), updatedAt: NOW(),
    });
  }
}

describe("TypeSafe routed screening", () => {
  it("falls back to a language credential on malformed typed answers with health and usage recorded", async () => {
    const db = await createTestDb(); await seedRoute(db);
    fetchMock.mockResolvedValueOnce(Response.json({ answers: {} }))
      .mockResolvedValueOnce(Response.json({ status: "completed", output_text: JSON.stringify({ isSupportRequest: true, isSpam: false, confidence: 0.99 }) }));
    const result = await classifyInboundEmail(db, emailInput, options.candidates);
    expect(result?.isSpam).toBe(false);
    const credential = await db.query.aiCredentials.findFirst({ where: eq(aiCredentials.id, "typesafe") });
    expect(credential?.failureCount).toBe(1);
    expect(credential?.blockedUntil).not.toBeNull();
    expect((await db.select().from(aiUsageEvents)).map((row) => row.success).sort()).toEqual([false, true]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://api.typesafe.ai/v1/systemone", "https://api.openai.com/v1/responses"]);
  });

  it("falls back from a language credential to Jev and leaves uncertain mail available", async () => {
    const db = await createTestDb(); await seedRoute(db);
    await db.update(aiTaskCredentials).set({ priority: -1 }).where(eq(aiTaskCredentials.id, "openai"));
    const response = fixture(); response.answers.spam = noul(0.6); response.answers.support = noul(0.99);
    fetchMock.mockResolvedValueOnce(Response.json({ output_text: "invalid" })).mockResolvedValueOnce(Response.json(response));
    const result = await classifyInboundEmail(db, emailInput, options.candidates);
    expect(result?.spamProbability).toBe(0.6);
    expect(shouldRejectEmail(result!, "medium")).toBe(false);
    expect(shouldRejectEmail(result!, "high")).toBe(true);
    expect(result?.keywords).toEqual([]);
    expect(result?.ticketTypeId).toBeUndefined();
  });

  it("keeps email intake best-effort when the sole TypeSafe credential fails", async () => {
    const db = await createTestDb(); await seedRoute(db, false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(new Response(null, { status: 529 }));
    expect(await classifyInboundEmail(db, emailInput, [])).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await db.query.aiCredentials.findFirst())?.blockedUntil).toBeNull();
  });

  it.each([[0.95, 0.99, true], [0.01, 0.1, true], [0.6, 0.99, false], [0.5, 0.5, false]])(
    "uses independent spam/support probabilities (%s, %s)", async (spam, support, rejected) => {
      const db = await createTestDb(); await seedRoute(db, false);
      const response = fixture(); response.answers.spam = noul(spam); response.answers.support = noul(support);
      fetchMock.mockResolvedValue(Response.json(response));
      const result = await classifyInboundEmail(db, emailInput, options.candidates);
      expect(shouldRejectEmail(result!, "medium")).toBe(rejected);
      if (spam === 0.5) expect(shouldRejectEmail(result!, "high")).toBe(false);
    },
  );

  it("persists ticket judgments and actual model version through inherited routes without changing activity", async () => {
    const db = await createTestDb(); await seedRoute(db, false);
    await db.insert(tenants).values({ id: "tenant", name: "Tenant" });
    await db.insert(products).values({ id: "product", tenantId: "tenant", name: "Product" });
    await db.insert(tickets).values({ id: "ticket", tenantId: "tenant", productId: "product", subject: "Help", content: "Login broken", teamId: "team", status: TicketStatus.New, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: "2026-01-01" });
    const response = fixture(); Reflect.deleteProperty(response.answers, "ticket_type");
    fetchMock.mockResolvedValue(Response.json(response));
    expect(await hasConfiguredAITask(db, "prescreening", { productId: "product" })).toBe(true);
    await prescreenTicket(db, "ticket");
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, "ticket") });
    expect(ticket).toMatchObject({ aiScreeningStatus: "completed", updatedAt: "2026-01-01", aiKeywords: '["account","technical"]' });
    expect(JSON.parse(ticket!.aiScreeningResult!).decision.model).toBe("jev-1.13.0");
    expect((await db.select().from(aiUsageEvents))[0]).toMatchObject({ provider: "typesafe", model: "jev-1.13.0", totalTokens: 360, tenantId: "tenant", productId: "product" });
    expect((await db.select().from(aiUsageDaily)).map((row) => row.dimension).sort()).toEqual(["product", "system", "tenant"]);
  });

  it("verifies decision capability and blocks Jev on every generative or vector task", async () => {
    const db = await createTestDb(); await seedRoute(db, false);
    fetchMock.mockResolvedValue(Response.json({ models: [{ name: "jev-latest", description: "System One", release_date: "2026-09-01" }] }));
    await saveTaskRouting(db, "prescreening", true, [{ credentialId: "typesafe", model: "jev-1.13.0", modelKind: "text" }]);
    const route = await db.query.aiTaskCredentials.findFirst();
    expect(route?.modelKind).toBe("decision");
    for (const task of ["agent", "translation", "prereply", "rerank"] as const) {
      await expect(saveTaskRouting(db, task, true, [{ credentialId: "typesafe", model: "jev-latest" }])).rejects.toThrow(/provider is not supported/);
    }
    await expect(saveTaskRouting(db, "prescreening", true, [{ credentialId: "typesafe", model: "gpt-5" }])).rejects.toThrow(/not compatible/);
    await db.update(aiTaskCredentials).set({ taskType: "translation" });
    await db.insert(aiConfigs).values({ id: "translation", taskType: "translation", createdAt: NOW(), updatedAt: NOW() });
    expect(await getAIProvider(db, "translation")).toBeNull();
  });
});
