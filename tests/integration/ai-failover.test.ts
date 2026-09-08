import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiConfigs, aiCredentials, aiTaskCredentials, aiUsageEvents } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { createTestDb, NOW } from "./test-db";
import { getAIProvider } from "@/services/ai/config";
import { classifyInboundEmail, shouldRejectEmail } from "@/services/ai/email-filter";

vi.mock("@/lib/db", () => ({ getEnv: () => ({ AUTH_SECRET: "test-only", VECTORIZE: { describe: async () => ({ dimensions: 1024 }) } }) }));
vi.mock("@/lib/secret-storage", () => ({ openStoredSecret: async () => "fake-api-key" }));
let db: Database;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  db = await createTestDb();
});
afterEach(() => vi.unstubAllGlobals());

async function seedRoute(taskType: "embedding" | "prescreening" | "rerank") {
  await db.insert(aiConfigs).values({ id: taskType, taskType, createdAt: NOW(), updatedAt: NOW() });
  for (const [priority, id] of ["first", "second"].entries()) {
    await db.insert(aiCredentials).values({
      id, name: id, provider: taskType === "rerank" ? "cohere" : "openai", apiKey: "fake", secretPurpose: id,
      createdAt: NOW(), updatedAt: NOW(),
    });
    await db.insert(aiTaskCredentials).values({
      id, taskType, credentialId: id, model: taskType === "embedding" ? "text-embedding-3-small" : "gpt-5.4-mini",
      modelKind: taskType === "embedding" ? "embedding" : taskType === "rerank" ? "rerank" : "text",
      modelDimensions: taskType === "embedding" ? 1024 : null,
      priority, createdAt: NOW(), updatedAt: NOW(),
    });
  }
}

const completion = (content: object) => Response.json({ status: "completed", output_text: JSON.stringify(content) });

describe("AI provider protocol failover", () => {
  it("tries another rerank credential after an empty successful payload", async () => {
    await seedRoute("rerank");
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [{ index: 1, relevance_score: 0.9 }] }));
    const provider = await getAIProvider(db, "rerank");
    const result = await provider!.rerank!({ query: "help", documents: ["one", "two"], topN: 1 });
    expect(result.results[0].index).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    [1, 2],
    Array.from({ length: 1024 }, (_, index) => index === 5 ? null : 0.1),
  ])("tries the fallback when an embedding payload is invalid (%#)", async (...values) => {
    await seedRoute("embedding");
    const valid = Array.from({ length: 1024 }, () => 0.2);
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ embedding: values }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ embedding: valid }], usage: { total_tokens: 9 } }));
    const provider = await getAIProvider(db, "embedding");
    expect((await provider!.embed("help")).embedding).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = await db.query.aiCredentials.findFirst({ where: eq(aiCredentials.id, "first") });
    expect(first?.failureCount).toBe(1);
    expect(first?.blockedUntil).not.toBeNull();
    const usage = await db.select().from(aiUsageEvents);
    expect(usage.map((row) => row.success).sort()).toEqual([false, true]);
  });

  it("falls back from malformed email verdicts instead of quarantining uncertain mail", async () => {
    await seedRoute("prescreening");
    fetchMock.mockResolvedValueOnce(completion({ isSupportRequest: false, isSpam: true }))
      .mockResolvedValueOnce(completion({ isSupportRequest: true, isSpam: false, confidence: 0.99, issues: ["Help"], keywords: [] }));
    const result = await classifyInboundEmail(db, { fromEmail: "customer@example.com", subject: "Help", content: "Broken" });
    expect(result?.isSupportRequest).toBe(true);
    expect(shouldRejectEmail(result!, "high")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails open after every classification credential fails", async () => {
    await seedRoute("prescreening");
    fetchMock.mockImplementation(async () => completion({ isSupportRequest: false, isSpam: true, confidence: 2 }));
    expect(await classifyInboundEmail(db, { fromEmail: "customer@example.com", subject: "Help", content: "Broken" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const last = await db.query.aiCredentials.findFirst({ where: eq(aiCredentials.id, "second") });
    expect(last?.blockedUntil).toBeNull();
  });
});
