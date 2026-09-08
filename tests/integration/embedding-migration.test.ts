import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { aiConfigs, aiCredentials, aiTaskCredentials, productKnowledge, products, tenants } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { createTestDb, NOW } from "./test-db";
import { embedKnowledge, rebuildKnowledgeEmbeddings, searchSimilar, knowledgeEmbeddingStatus, findRelevantKnowledge } from "@/services/ai/embedding";
import { getAIProvider, getEmbeddingProfile } from "@/services/ai/config";
import { vectorNamespace } from "@/services/ai/vector-space";
import { saveTaskRouting } from "@/app/api/tob/admin/ai/config/shared";

const mocks = vi.hoisted(() => ({
  describe: vi.fn(), upsert: vi.fn(), query: vi.fn(), deleteByIds: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getEnv: () => ({ AUTH_SECRET: "fake", VECTORIZE: mocks }) }));
vi.mock("@/lib/secret-storage", () => ({ openStoredSecret: async () => "fake" }));
let db: Database;
let dimensions: number;
afterEach(() => vi.unstubAllGlobals());

beforeEach(async () => {
  vi.clearAllMocks();
  dimensions = 768;
  mocks.describe.mockImplementation(async () => ({ dimensions }));
  mocks.upsert.mockResolvedValue({ mutationId: "accepted" });
  mocks.deleteByIds.mockResolvedValue({ mutationId: "deleted" });
  mocks.query.mockResolvedValue({ matches: [] });
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ data: [{ embedding: Array(dimensions).fill(0.1) }] }));
  db = await createTestDb();
  await db.insert(tenants).values({ id: "tenant", name: "Tenant" });
  await db.insert(products).values({ id: "product", name: "Product", tenantId: "tenant" });
  await db.insert(aiConfigs).values({ id: "config", taskType: "embedding", createdAt: NOW(), updatedAt: NOW() });
  for (const [priority, id] of ["first", "fallback"].entries()) {
    await db.insert(aiCredentials).values({ id, name: id, provider: "openai", apiKey: "fake", secretPurpose: id, createdAt: NOW(), updatedAt: NOW() });
    await db.insert(aiTaskCredentials).values({ id, credentialId: id, taskType: "embedding", model: "text-embedding-3-small", modelKind: "embedding", modelDimensions: 768, priority, createdAt: NOW(), updatedAt: NOW() });
  }
  await db.insert(productKnowledge).values({ id: "knowledge", productId: "product", title: "Title", content: "Original", knowledgeType: "faq", vectorizeIds: '["knowledge:legacy"]', createdAt: NOW(), updatedAt: NOW() });
});

describe("embedding model migration", () => {
  it("keeps the primary model stable across credential usage with tied priorities", async () => {
    await db.update(aiTaskCredentials).set({ priority: 0 });
    await db.update(aiTaskCredentials).set({ model: "text-embedding-3-large" }).where(eq(aiTaskCredentials.id, "fallback"));
    const before = await getEmbeddingProfile(db, { productId: "product" });
    await db.update(aiCredentials).set({ lastUsedAt: "2099-01-01T00:00:00.000Z" }).where(eq(aiCredentials.id, "fallback"));
    expect(await getEmbeddingProfile(db, { productId: "product" })).toEqual(before);
  });

  it("retains verified knowledge if describe fails during the pending lookup", async () => {
    await embedKnowledge(db, "knowledge");
    const vector = mocks.upsert.mock.calls[0][0][0];
    mocks.query.mockResolvedValue({ matches: [{ ...vector, score: 0.9 }] });
    mocks.describe.mockResolvedValueOnce({ dimensions: 768 })
      .mockResolvedValueOnce({ dimensions: 768 })
      .mockRejectedValueOnce(new Error("Temporary describe failure"));
    expect((await findRelevantKnowledge(db, "product", "query")).map((row) => row.id)).toEqual(["knowledge"]);
  });
  it("saves server-derived dimensions and rejects different-model fallback routes", async () => {
    await saveTaskRouting(db, "embedding", true, [{
      credentialId: "first", model: "custom-embedding", modelDimensions: 1024,
    }]);
    expect((await db.query.aiTaskCredentials.findFirst())?.modelDimensions).toBe(768);
    await expect(saveTaskRouting(db, "embedding", true, [
      { credentialId: "first", model: "custom-embedding" },
      { credentialId: "fallback", model: "other-embedding" },
    ])).rejects.toThrow(/same provider, endpoint, model and dimensions/);
    expect((await db.query.aiTaskCredentials.findFirst())?.model).toBe("custom-embedding");
  });
  it("uses bound index dimensions and isolates model changes even at the same dimension", async () => {
    expect(await embedKnowledge(db, "knowledge")).toBe(true);
    expect(JSON.parse(String(mocks.fetch.mock.calls[0][1].body)).dimensions).toBe(768);
    const first = (await db.query.productKnowledge.findFirst())!;
    const namespace = mocks.upsert.mock.calls[0][0][0].namespace;
    expect(namespace).toHaveLength(64);
    expect(mocks.deleteByIds).toHaveBeenCalledWith(["knowledge:legacy"]);
    await db.update(aiTaskCredentials).set({ model: "text-embedding-3-large" });
    const status = await knowledgeEmbeddingStatus(db, "product");
    expect(status.pending).toBe(1);
    await searchSimilar(db, "Query", { productId: "product" });
    expect(mocks.query.mock.calls[0][1].namespace).not.toBe(namespace);
    // Retry gate is time-bounded and stored durably in D1.
    await db.update(productKnowledge).set({ embeddingAttemptedAt: null });
    expect(await rebuildKnowledgeEmbeddings(db)).toEqual({ attempted: 1, completed: 1 });
    const next = (await db.query.productKnowledge.findFirst())!;
    expect(next.embeddingSpace).not.toBe(first.embeddingSpace);
    expect(next.updatedAt).toBe(first.updatedAt);
    expect((await knowledgeEmbeddingStatus(db, "product")).pending).toBe(0);
  });

  it("does not use a different-model fallback, including when the primary cools down", async () => {
    await db.update(aiTaskCredentials).set({ model: "text-embedding-3-large" }).where(eq(aiTaskCredentials.id, "fallback"));
    mocks.fetch.mockImplementation(async () => Response.json({ error: "offline" }, { status: 503 }));
    const provider = await getAIProvider(db, "embedding", { productId: "product" });
    await expect(provider!.embed("query")).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await db.update(aiCredentials).set({ blockedUntil: new Date(Date.now() + 60_000).toISOString() }).where(eq(aiCredentials.id, "first"));
    expect(await getAIProvider(db, "embedding", { productId: "product" })).toBeNull();
  });

  it("rebuilds inherited tenant route changes and retries failed records", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("Vectorize unavailable"));
    expect(await embedKnowledge(db, "knowledge")).toBe(false);
    const failed = (await db.query.productKnowledge.findFirst())!;
    expect(failed.embeddingError).toContain("unavailable");
    expect(failed.embeddingLease).toBeNull();
    await db.insert(aiConfigs).values({ id: "tenant-config", taskType: "embedding", scopeKey: "tenant:tenant", createdAt: NOW(), updatedAt: NOW() });
    await db.insert(aiTaskCredentials).values({ id: "tenant-route", taskType: "embedding", scopeKey: "tenant:tenant", credentialId: "first", model: "text-embedding-3-large", modelKind: "embedding", modelDimensions: 768, createdAt: NOW(), updatedAt: NOW() });
    await db.update(productKnowledge).set({ embeddingAttemptedAt: null });
    expect((await rebuildKnowledgeEmbeddings(db)).completed).toBe(1);
    expect((await knowledgeEmbeddingStatus(db, "product")).profile?.model).toBe("text-embedding-3-large");
  });

  it("does not publish an embedding for content edited while the provider is running", async () => {
    mocks.fetch.mockImplementationOnce(async () => {
      await db.update(productKnowledge).set({ content: "Edited", updatedAt: "2099-01-01T00:00:00.000Z" });
      return Response.json({ data: [{ embedding: Array(768).fill(0.1) }] });
    });
    expect(await embedKnowledge(db, "knowledge")).toBe(false);
    const row = (await db.query.productKnowledge.findFirst())!;
    expect(row.content).toBe("Edited");
    expect(row.embeddingSpace).toBeNull();
    expect(row.embeddingLease).toBeNull();
    expect(mocks.deleteByIds).toHaveBeenCalled();
  });

  it("claims only one job for concurrent rebuilds", async () => {
    const results = await Promise.all([embedKnowledge(db, "knowledge"), embedKnowledge(db, "knowledge")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects stale and foreign vectors even if Vectorize returns them", async () => {
    await embedKnowledge(db, "knowledge");
    const vector = mocks.upsert.mock.calls[0][0][0];
    mocks.query.mockResolvedValue({ matches: [
      { ...vector, score: 0.9 },
      { ...vector, id: "old-vector", score: 0.9 },
      { ...vector, metadata: { ...vector.metadata, productId: "other-product" }, score: 0.9 },
    ] });
    expect(await searchSimilar(db, "query", { productId: "product" })).toHaveLength(1);
    await db.update(productKnowledge).set({ updatedAt: "2099-01-01T00:00:00.000Z" });
    expect(await searchSimilar(db, "query", { productId: "product" })).toHaveLength(0);
  });

  it("detects a changed index dimension before sending provider work", async () => {
    dimensions = 1536;
    await expect(getEmbeddingProfile(db, { productId: "product" })).rejects.toThrow(/requires 1536/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await db.update(aiTaskCredentials).set({ modelDimensions: 1536 });
    expect(await embedKnowledge(db, "knowledge")).toBe(true);
    expect(mocks.upsert.mock.calls[0][0][0].values).toHaveLength(1536);
  });

  it("accepts beta describe metadata and hashes long product ids safely", async () => {
    mocks.describe.mockResolvedValue({ config: { dimensions: 768 } });
    expect((await getEmbeddingProfile(db, { productId: "product" }))?.dimensions).toBe(768);
    expect(await vectorNamespace("p".repeat(128), "s".repeat(64))).toHaveLength(64);
  });
});
