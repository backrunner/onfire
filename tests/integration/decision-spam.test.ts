import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiConfigs, aiCredentials, aiTaskCredentials, aiUsageEvents, emailConfigs, inboundEmails, products, replies, spamFilterConfigs, teams, tenants, tickets } from "@/drizzle/schema";
import type { AIProvider, SpamFilterConfigRow } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { TypeSafeProvider } from "@/services/ai/providers/typesafe";
import { SpamDecisionProvider } from "@/services/ai/providers/spam-decision";
import { getAIProvider } from "@/services/ai/config";
import { saveTaskRouting } from "@/app/api/tob/admin/ai/config/shared";
import { runSpamFilter, resolveSpamFilterConfig } from "@/services/email/spam-filter";
import { processInboundEmail } from "@/services/email/inbound";
import { createTestDb, NOW, uid } from "./test-db";

vi.mock("@/lib/db", () => ({ getEnv: () => ({ AUTH_SECRET: "test-only" }) }));
vi.mock("@/lib/secret-storage", () => ({ openStoredSecret: async () => "test-api-key" }));
const fetchMock = vi.fn<typeof fetch>();
const options = { message: { subject: "无法登录", content: "Please help me sign in.", fromEmail: "customer@example.com" }, timeoutMs: 1000 };
const input = { ...options.message, messageId: "msg", toEmail: "support@example.com" };
const jev = (score = 0.97) => ({ model: "jev-1.13.0", answers: { spam: { type: "noul", noul: score }, support: { type: "noul", noul: 1 - score } }, usage: { input_tokens: 100, output_tokens: 10 } });
const config = (): SpamFilterConfigRow => ({ id: "spam", scopeKey: "global", scope: "global", tenantId: null, mode: "custom", provider: "ai", endpointUrl: null, authSecret: null, timeoutMs: 1000, spamThreshold: 0.9, suspectThreshold: 0.5, createdAt: NOW(), updatedAt: NOW() });
const hf = (spamLabel = "spam", baseUrl?: string) => new SpamDecisionProvider({ provider: "huggingface", model: "owner/classifier", apiKey: "test-api-key", spamLabel, supportLabel: spamLabel === "LABEL_1" ? "LABEL_0" : "ham", baseUrl });
const custom = () => new SpamDecisionProvider({ provider: "decision", model: "commercial-v1", apiKey: "test-api-key", baseUrl: "https://classifier.example.com/predict" });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("native spam decisions", () => {
  it("asks Jev spam and genuine-support propositions without category judgments", async () => {
    fetchMock.mockResolvedValue(Response.json(jev()));
    const result = await new TypeSafeProvider({ provider: "typesafe", model: "jev-latest", apiKey: "test-api-key" }).checkSpam(options);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    const body = JSON.parse(String(init?.body));
    expect(Object.keys(body.questions)).toEqual(["spam", "support"]);
    expect(body.state.message).toEqual(options.message);
    expect(body.questions.spam.criteria.false).toContain("quoting spam");
    expect(result).toEqual({ spamProbability: 0.97, supportProbability: 0.030000000000000027, provider: "typesafe", model: "jev-1.13.0", usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 } });
  });
  it("uses a native HF classifier, explicit label mapping and a complete probability distribution", async () => {
    fetchMock.mockResolvedValue(Response.json([{ label: "LABEL_0", score: 0.04 }, { label: "LABEL_1", score: 0.96 }]));
    expect(await hf("LABEL_1").checkSpam(options)).toMatchObject({ spamProbability: 0.96, provider: "huggingface" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://router.huggingface.co/hf-inference/models/owner/classifier");
    expect(JSON.parse(String(init?.body))).toEqual({ inputs: JSON.stringify(options.message), parameters: { function_to_apply: "softmax", top_k: 256 } });
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("supports hosted HF-compatible endpoints and nested single-input results", async () => {
    fetchMock.mockResolvedValue(Response.json([[{ label: "ham", score: 0.8 }, { label: "spam", score: 0.2 }]]));
    expect((await hf("spam", "https://model.example.com/predict").checkSpam(options)).spamProbability).toBe(0.2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://model.example.com/predict");
  });
  it("uses a model-independent decision contract at the exact configured URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ model: "commercial-v1.2", spamProbability: 0.91, supportProbability: 0.02 }));
    expect(await custom().checkSpam(options)).toEqual({ model: "commercial-v1.2", spamProbability: 0.91, supportProbability: 0.02, provider: "decision" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://classifier.example.com/predict");
    expect(JSON.parse(String(init?.body))).toEqual({ protocol: "onfire-decision-v1", model: "commercial-v1", message: options.message });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-api-key" });
  });
  it.each([
    [], [{ label: "spam", score: 0.9 }],
    [{ label: "ham", score: 0.1 }, { label: "spam", score: 1.2 }],
    [{ label: "spam", score: 0.5 }, { label: "spam", score: 0.5 }],
    [{ label: "ham", score: 0.1 }, { label: "spam", score: 0.1 }],
    [{ label: "LABEL_0", score: 0.1 }, { label: "LABEL_1", score: 0.9 }],
  ].map((payload) => [payload]))("rejects incomplete, unmapped or invalid HF distributions (%#)", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(hf().checkSpam(options)).rejects.toThrow();
  });
  it.each([{ spamProbability: 0.9 }, { model: "m", spamProbability: -0.1 }, { model: "m", verdict: "spam" }, { model: "m", spamProbability: "0.9" }])("rejects malformed custom decisions (%#)", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(custom().checkSpam(options)).rejects.toThrow(/Invalid/);
  });
  it.each([302, 307, 401, 429, 503])("rejects HTTP %s without leaking upstream content", async (status) => {
    fetchMock.mockResolvedValue(new Response("test-api-key private message", { status }));
    await expect(custom().checkSpam(options)).rejects.toThrow(`Spam decision failed (HTTP ${status})`);
  });
  it("bounds input/body time/response and sanitizes network and parsing errors", async () => {
    await expect(custom().checkSpam({ ...options, message: { ...options.message, content: "中".repeat(9000) } })).rejects.toThrow(/budget/);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new Error("test-api-key private transport"));
    await expect(custom().checkSpam(options)).rejects.toThrow("Spam decision request failed, timed out or returned invalid JSON");
    fetchMock.mockResolvedValueOnce(new Response("test-api-key malformed JSON", { headers: { "content-type": "application/json" } }));
    await expect(custom().checkSpam(options)).rejects.toThrow(/invalid JSON/);
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(65_537), { headers: { "content-type": "application/json" } }));
    await expect(custom().checkSpam(options)).rejects.toThrow(/invalid JSON/);
    fetchMock.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")))));
    await expect(custom().checkSpam({ ...options, timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });
  it("rejects missing/private endpoints and model path traversal", () => {
    for (const baseUrl of [undefined, "http://localhost", "https://127.0.0.1", "https://example.com/predict?key=secret"]) {
      expect(() => new SpamDecisionProvider({ provider: "decision", model: "m", apiKey: "test", baseUrl })).toThrow();
    }
    expect(() => new SpamDecisionProvider({ provider: "huggingface", model: "owner/../../private", apiKey: "test" })).toThrow();
  });
});

async function seed(db: Database) {
  await db.insert(tenants).values([{ id: "tenant", name: "Tenant", defaultTeamId: "team" }, { id: "other", name: "Other" }]);
  await db.insert(teams).values({ id: "team", name: "Team", tenantId: "tenant" });
  await db.insert(products).values({ id: "product", name: "Product", tenantId: "tenant" });
}
async function route(db: Database, provider: AIProvider = "typesafe", scopeKey = "system", priority = 0) {
  const id = `${scopeKey}:${provider}`;
  await db.insert(aiConfigs).values({ id, scopeKey, taskType: "spam", createdAt: NOW(), updatedAt: NOW() }).onConflictDoNothing();
  await db.insert(aiCredentials).values({ id, name: id, provider, apiKey: "sealed", secretPurpose: id, baseUrl: provider === "decision" ? "https://classifier.example.com/predict" : null, createdAt: NOW(), updatedAt: NOW() });
  await db.insert(aiTaskCredentials).values({ id, scopeKey, credentialId: id, taskType: "spam", model: provider === "typesafe" ? "jev-latest" : provider === "huggingface" ? "owner/classifier" : "commercial-v1", modelKind: "decision", spamLabel: provider === "huggingface" ? "LABEL_1" : null, supportLabel: provider === "huggingface" ? "LABEL_0" : null, priority, createdAt: NOW(), updatedAt: NOW() });
  return id;
}

describe("scoped decision filtering", () => {
  it.each(["推广我们的产品", "合作邀约", "asdf qwer 123", "无关的天气信息"])("rejects non-ticket content even with low traditional spam probability: %s", async (content) => {
    const db = await createTestDb(); await seed(db); await route(db);
    const response = jev(0.01); response.answers.support.noul = 0.02;
    fetchMock.mockResolvedValue(Response.json(response));
    expect(await runSpamFilter(db, config(), { ...input, content }, { productId: "product" })).toMatchObject({ verdict: "spam", spamProbability: 0.01, supportProbability: 0.02, score: 0.98 });
  });
  it("does not allow non-support content when an administrator raises the suspect threshold", async () => {
    const db = await createTestDb(); await seed(db); await route(db);
    const response = jev(0.01); response.answers.support.noul = 0.45;
    fetchMock.mockResolvedValue(Response.json(response));
    expect((await runSpamFilter(db, { ...config(), suspectThreshold: 0.8 }, input, { productId: "product" })).verdict).toBe("suspect");
  });
  it("rejects a custom decision without its independently required support probability", async () => {
    fetchMock.mockResolvedValue(Response.json({ model: "spam-only", spamProbability: 0.01 }));
    await expect(custom().checkSpam(options)).rejects.toThrow(/Invalid/);
  });
  it("classifies multi-class meaningless content through the genuine-support label", async () => {
    fetchMock.mockResolvedValue(Response.json([{ label: "ham", score: 0.02 }, { label: "spam", score: 0.01 }, { label: "meaningless", score: 0.97 }]));
    expect(await hf().checkSpam(options)).toMatchObject({ spamProbability: 0.01, supportProbability: 0.02 });
  });
  it.each([[0.49, "allow"], [0.5, "suspect"], [0.89, "suspect"], [0.9, "spam"]])("applies probability thresholds (%s)", async (score, verdict) => {
    const db = await createTestDb(); await seed(db); await route(db);
    fetchMock.mockResolvedValue(Response.json(jev(Number(score))));
    expect(await runSpamFilter(db, config(), input, { productId: "product", tenantId: "tenant" })).toMatchObject({ verdict, score, model: "jev-1.13.0" });
  });
  it("fails over across decision protocols and records credential health, actual models and tenant usage", async () => {
    const db = await createTestDb(); await seed(db); const first = await route(db); await route(db, "huggingface", "system", 1);
    fetchMock.mockResolvedValueOnce(Response.json({ answers: {} })).mockResolvedValueOnce(Response.json([{ label: "LABEL_0", score: 0.03 }, { label: "LABEL_1", score: 0.97 }]));
    expect(await runSpamFilter(db, config(), input, { productId: "product", tenantId: "tenant" })).toMatchObject({ verdict: "spam", decisionProvider: "huggingface" });
    expect((await db.query.aiCredentials.findFirst({ where: eq(aiCredentials.id, first) }))?.failureCount).toBe(1);
    const usage = await db.select().from(aiUsageEvents);
    expect(usage.map((item) => item.success).sort()).toEqual([false, true]);
    expect(usage.every((item) => item.taskType === "spam" && item.productId === "product" && item.tenantId === "tenant")).toBe(true);
  });
  it("respects product overrides, tenant disable, global spam inheritance and explicit spam disable", async () => {
    const db = await createTestDb(); await seed(db); await route(db); await route(db, "decision", "product:product");
    fetchMock.mockResolvedValue(Response.json({ model: "custom", spamProbability: 0.2, supportProbability: 0.8 }));
    expect((await runSpamFilter(db, config(), input, { productId: "product" })).decisionProvider).toBe("decision");
    await db.delete(aiConfigs).where(eq(aiConfigs.scopeKey, "product:product"));
    await db.insert(aiConfigs).values({ id: "disabled", scopeKey: "tenant:tenant", taskType: "spam", enabled: false, createdAt: NOW(), updatedAt: NOW() });
    expect(await getAIProvider(db, "spam", { productId: "product" })).toBeNull();
    await db.insert(spamFilterConfigs).values(config());
    expect((await resolveSpamFilterConfig(db, "tenant"))?.provider).toBe("ai");
    await db.insert(spamFilterConfigs).values({ ...config(), id: "disabled", scopeKey: "tenant:tenant", tenantId: "tenant", scope: "tenant", mode: "disabled" });
    expect(await resolveSpamFilterConfig(db, "tenant")).toBeNull();
  });
  it("validates capabilities, label mapping and credential scope when saving routes", async () => {
    const db = await createTestDb(); await seed(db); const id = await route(db, "huggingface");
    await expect(saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "owner/classifier" }])).rejects.toThrow(/explicit spam and genuine-support labels/);
    await saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "owner/new-classifier", spamLabel: "JUNK", supportLabel: "GENUINE", modelKind: "text" }]);
    expect(await db.query.aiTaskCredentials.findFirst()).toMatchObject({ modelKind: "decision", spamLabel: "JUNK" });
    await expect(saveTaskRouting(db, "translation", true, [{ credentialId: id, model: "owner/classifier" }])).rejects.toThrow(/provider/);
    await db.update(aiCredentials).set({ scope: "tenant", tenantId: "other" }).where(eq(aiCredentials.id, id));
    await expect(saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "owner/classifier", spamLabel: "spam", supportLabel: "support" }], { scope: "tenant", tenantId: "tenant" })).rejects.toThrow(/outside/);
  });
  it("quarantines spam on both new mail and existing-ticket replies, while suspect and failed decisions stay isolated", async () => {
    const db = await createTestDb(); await seed(db); await route(db); await db.insert(spamFilterConfigs).values(config());
    await db.insert(emailConfigs).values({ id: "email", productId: "product", inboundEnabled: true, inboundProvider: "generic", inboundAddress: "support@example.com", aiFilterEnabled: false, createdAt: NOW(), updatedAt: NOW() });
    const email = (subject = "Need help") => ({ fromEmail: "customer@example.com", toEmail: "support@example.com", subject, bodyPlain: "Please help", messageId: uid("decision-mail") });
    fetchMock.mockResolvedValueOnce(Response.json(jev(0.95)));
    expect((await processInboundEmail(db, email())).action).toBe("quarantined");
    const quarantined = await db.query.inboundEmails.findFirst();
    expect(JSON.parse(quarantined!.filterResult!)).toMatchObject({ score: 0.95, model: "jev-1.13.0", decisionProvider: "typesafe" });
    fetchMock.mockResolvedValueOnce(Response.json(jev(0.6)));
    expect((await processInboundEmail(db, email())).action).toBe("quarantined");
    fetchMock.mockResolvedValueOnce(Response.json(jev(0.01)));
    const created = await processInboundEmail(db, email());
    expect(created.action).toBe("ticket_created");
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, created.ticketId!) });
    fetchMock.mockResolvedValueOnce(Response.json(jev(0.98)));
    expect((await processInboundEmail(db, email(`Re: [Ticket #${ticket!.number}]`))).action).toBe("quarantined");
    expect(await db.select().from(replies)).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await processInboundEmail(db, email())).action).toBe("quarantined");
  });
});
