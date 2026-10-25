import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db";
import { aiCredentials, aiTaskCredentials, products, tenants, users, userProducts } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { isSealedSecret, openStoredSecret } from "@/lib/secret-storage";
import { saveTaskRouting } from "@/app/api/tob/admin/ai/config/shared";
import { GET, POST } from "@/app/api/tob/admin/ai/credentials/route";
import { PATCH, DELETE } from "@/app/api/tob/admin/ai/credentials/[id]/route";
import { GET as modelsGET } from "@/app/api/tob/admin/ai/models/route";
import { createTestDb } from "./test-db";
import { PATCH as spamPATCH, GET as spamGET } from "@/app/api/tob/admin/spam-filter/route";
import { getAIProvider } from "@/services/ai/config";

let db: Database;
let actorId: string | null;
const masterSecret = "local-test-master-secret";
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: masterSecret }) }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => actorId ? { user: { id: actorId } } : null } }) }));

const fetchMock = vi.fn<typeof fetch>();
const key = "test-only-typesafe-key";
const route = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (path: string, method = "GET", body?: unknown) => new NextRequest(`https://admin.example.com/api/tob/admin/ai/${path}`, {
  method, headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json({ models: [{ name: "jev-latest" }] }));
  db = await createTestDb(); actorId = "super";
  await db.insert(tenants).values([{ id: "tenant", name: "Tenant" }, { id: "other", name: "Other" }]);
  await db.insert(products).values([{ id: "product", tenantId: "tenant", name: "Product" }, { id: "foreign", tenantId: "other", name: "Foreign" }]);
  await db.insert(users).values([
    { id: "super", email: "super@example.com", displayName: "Super", role: Role.SuperAdmin, tenantId: "tenant" },
    { id: "tenant-admin", email: "tenant@example.com", displayName: "Tenant", role: Role.TenantAdmin, tenantId: "tenant" },
    { id: "product-admin", email: "product@example.com", displayName: "Product", role: Role.ProductAdmin, tenantId: "tenant" },
    { id: "agent", email: "agent@example.com", displayName: "Agent", role: Role.Agent, tenantId: "tenant" },
  ]);
  await db.insert(userProducts).values({ userId: "product-admin", productId: "product" });
});
afterEach(() => vi.unstubAllGlobals());

async function createCredential(query = "") {
  const response = await POST(request(`credentials${query}`, "POST", { name: "Jev", provider: "typesafe", apiKey: key }));
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain(key);
  return z.object({ data: z.object({ id: z.string() }) }).parse(body).data.id;
}

describe("OpenRouter model routing", () => {
  it("discovers and saves rerank capabilities, then executes the saved scoped route", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/rerank")) return Response.json({ results: [{ index: 1, relevance_score: 0.9 }], usage: { total_tokens: 8 } });
      if (url.includes("output_modalities=rerank")) return Response.json({ data: [{ id: "cohere/rerank-v3.5", architecture: { modality: "text->rerank" } }] });
      if (url.endsWith("/embeddings/models")) return Response.json({ data: [{ id: "qwen/qwen3-embedding-8b" }] });
      return Response.json({ data: [{ id: "openai/gpt-5", architecture: { modality: "text->text" } }] });
    });
    const created = await POST(request("credentials", "POST", { name: "OpenRouter", provider: "openrouter", apiKey: "test-only-openrouter-key" }));
    expect(created.status).toBe(201);
    const id = z.object({ data: z.object({ id: z.string() }) }).parse(await created.json()).data.id;
    const response = await modelsGET(request(`models?credentialId=${id}&taskType=rerank`));
    expect(response.status).toBe(200);
    const catalog = z.object({ data: z.object({ models: z.array(z.object({ id: z.string(), kind: z.string() })) }) }).parse(await response.json());
    expect(catalog.data.models).toEqual(expect.arrayContaining([{ id: "cohere/rerank-v3.5", kind: "rerank" }, { id: "qwen/qwen3-embedding-8b", kind: "embedding" }]));
    await saveTaskRouting(db, "rerank", true, [{ credentialId: id, model: "cohere/rerank-v3.5" }]);
    expect(await db.query.aiTaskCredentials.findFirst()).toMatchObject({ modelKind: "rerank", modelDimensions: null });
    await expect(saveTaskRouting(db, "rerank", true, [{ credentialId: id, model: "openai/gpt-5" }])).rejects.toThrow();
    const provider = await getAIProvider(db, "rerank", { productId: "product" });
    expect(provider?.rerank).toBeTypeOf("function");
    await expect(provider!.rerank!({ query: "support", documents: ["irrelevant", "support"] })).resolves.toMatchObject({ results: [{ index: 1, relevanceScore: 0.9 }], usage: { totalTokens: 8 } });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("https://openrouter.ai/api/v1/rerank");
  });
});

describe("decision spam administration", () => {
  const spamRequest = (method = "GET", body?: unknown, tenantId?: string) => new NextRequest(`https://admin.example.com/api/tob/admin/spam-filter${tenantId ? `?tenantId=${tenantId}` : ""}`, {
    method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  it("requires a configured route and validates ordered thresholds before enabling AI", async () => {
    const payload = { mode: "custom", provider: "ai", spamThreshold: 0.9, suspectThreshold: 0.5 };
    expect((await spamPATCH(spamRequest("PATCH", payload))).status).toBe(400);
    const id = await createCredential();
    await saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "jev-latest" }]);
    expect((await spamPATCH(spamRequest("PATCH", { ...payload, suspectThreshold: 0.9 }))).status).toBe(400);
    expect((await spamPATCH(spamRequest("PATCH", payload))).status).toBe(200);
    const response = await spamGET(spamRequest());
    expect(z.object({ data: z.record(z.string(), z.unknown()) }).parse(await response.json()).data).toMatchObject({ provider: "ai", aiRouteConfigured: true, spamThreshold: 0.9, suspectThreshold: 0.5, secretConfigured: false });
  });
  it("retains tenant scope enforcement for spam settings and inherited AI availability", async () => {
    const id = await createCredential();
    await saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "jev-latest" }]);
    actorId = "tenant-admin";
    expect((await spamPATCH(spamRequest("PATCH", { tenantId: "other", mode: "disabled" }))).status).toBe(403);
    expect((await spamPATCH(spamRequest("PATCH", { mode: "custom", provider: "ai" }))).status).toBe(200);
    expect((await spamGET(spamRequest())).status).toBe(200);
    actorId = "product-admin";
    expect((await spamPATCH(spamRequest("PATCH", { mode: "disabled" }))).status).toBe(403);
  });
  it("requires a safe custom decision endpoint on create and forbids removing it on edit", async () => {
    const payload = { name: "Commercial decision", provider: "decision", apiKey: "test-only-decision" };
    expect((await POST(request("credentials", "POST", payload))).status).toBe(400);
    expect((await POST(request("credentials", "POST", { ...payload, baseUrl: "https://127.0.0.1/predict" }))).status).toBe(400);
    const created = await POST(request("credentials", "POST", { ...payload, baseUrl: "https://classifier.example.com/predict" }));
    expect(created.status).toBe(201);
    const id = z.object({ data: z.object({ id: z.string() }) }).parse(await created.json()).data.id;
    await saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "proprietary-v2" }]);
    expect((await PATCH(request(`credentials/${id}`, "PATCH", { baseUrl: null }), route(id))).status).toBe(400);
    fetchMock.mockClear();
    expect((await PATCH(request(`credentials/${id}`, "PATCH", { apiKey: "rotated-decision-key" }), route(id))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves explicit classifier mapping through credential rotation", async () => {
    const created = await POST(request("credentials", "POST", { name: "Open classifier", provider: "huggingface", apiKey: "test-hf" }));
    const id = z.object({ data: z.object({ id: z.string() }) }).parse(await created.json()).data.id;
    await saveTaskRouting(db, "spam", true, [{ credentialId: id, model: "owner/classifier", spamLabel: "LABEL_1", supportLabel: "LABEL_0" }]);
    expect((await PATCH(request(`credentials/${id}`, "PATCH", { apiKey: "test-hf-rotated" }), route(id))).status).toBe(200);
    expect((await db.query.aiTaskCredentials.findFirst())?.spamLabel).toBe("LABEL_1");
  });
});

describe("TypeSafe credentials API", () => {
  it("seals the key, hides it from reads, and uses the stored key for live model discovery", async () => {
    const id = await createCredential();
    const stored = (await db.query.aiCredentials.findFirst())!;
    expect(stored.provider).toBe("typesafe");
    expect(isSealedSecret(stored.apiKey)).toBe(true);
    expect(stored.apiKey).not.toContain(key);
    expect(await openStoredSecret(stored.apiKey, masterSecret, stored.secretPurpose)).toBe(key);
    const listing = await GET(request("credentials"));
    const listed = z.object({ data: z.array(z.record(z.string(), z.unknown())) }).parse(await listing.json());
    expect(listed.data[0]).toMatchObject({ id, provider: "typesafe", hasKey: true });
    expect(listed.data[0]).not.toHaveProperty("apiKey");
    const models = await modelsGET(request(`models?credentialId=${id}`));
    expect(models.status).toBe(200);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${key}` });
  });

  it("allows the UI's full metadata payload to disable a credential during provider outage without replacing its key", async () => {
    const id = await createCredential();
    await saveTaskRouting(db, "prescreening", true, [{ credentialId: id, model: "jev-1.13.0" }]);
    const previous = (await db.query.aiCredentials.findFirst())!;
    fetchMock.mockClear(); fetchMock.mockRejectedValue(new Error("offline"));
    const response = await PATCH(request(`credentials/${id}`, "PATCH", {
      name: "Jev paused", provider: "typesafe", apiMode: "responses", baseUrl: null, enabled: false, cooldownSeconds: 90,
    }), route(id));
    expect(response.status).toBe(200);
    const stored = (await db.query.aiCredentials.findFirst())!;
    expect(stored).toMatchObject({ name: "Jev paused", enabled: false, apiKey: previous.apiKey, cooldownSeconds: 90 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rotates a sealed key with a pinned version even when the catalog only lists aliases", async () => {
    const id = await createCredential();
    await saveTaskRouting(db, "prescreening", true, [{ credentialId: id, model: "jev-1.13.0" }]);
    fetchMock.mockClear();
    const response = await PATCH(request(`credentials/${id}`, "PATCH", { apiKey: "rotated-test-key" }), route(id));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer rotated-test-key" });
    const stored = (await db.query.aiCredentials.findFirst())!;
    expect(await openStoredSecret(stored.apiKey, masterSecret, stored.secretPurpose)).toBe("rotated-test-key");
    expect((await db.query.aiTaskCredentials.findFirst())?.modelKind).toBe("decision");
  });

  it("does not persist failed key rotations or expose upstream error bodies", async () => {
    const id = await createCredential();
    await saveTaskRouting(db, "prescreening", true, [{ credentialId: id, model: "jev-latest" }]);
    const previous = (await db.query.aiCredentials.findFirst())!;
    fetchMock.mockResolvedValue(new Response("rotated-test-key echoed here", { status: 401 }));
    const response = await PATCH(request(`credentials/${id}`, "PATCH", { apiKey: "rotated-test-key" }), route(id));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("rotated-test-key");
    expect((await db.query.aiCredentials.findFirst())?.apiKey).toBe(previous.apiKey);
  });

  it("prevents changing an assistant credential to TypeSafe until incompatible routes are removed", async () => {
    const id = await createCredential();
    await db.update(aiCredentials).set({ provider: "openai" }).where(eq(aiCredentials.id, id));
    await saveTaskRouting(db, "agent", true, [{ credentialId: id, model: "gpt-5.4-mini" }]);
    fetchMock.mockClear();
    const response = await PATCH(request(`credentials/${id}`, "PATCH", { provider: "typesafe" }), route(id));
    expect(response.status).toBe(400);
    expect((await db.query.aiCredentials.findFirst())?.provider).toBe("openai");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces role and tenant/product ownership for credential writes and deletes dependent routes", async () => {
    const systemId = await createCredential();
    actorId = "tenant-admin";
    const tenantId = await createCredential("?scope=tenant&tenantId=tenant");
    expect((await POST(request("credentials", "POST", { name: "Jev", provider: "typesafe", apiKey: key }))).status).toBe(403);
    expect((await PATCH(request(`credentials/${systemId}`, "PATCH", { enabled: false }), route(systemId))).status).toBe(403);
    expect((await POST(request("credentials?scope=tenant&tenantId=other", "POST", { name: "Jev", provider: "typesafe", apiKey: key }))).status).toBe(403);
    actorId = "product-admin";
    const productId = await createCredential("?scope=product&productId=product");
    expect((await PATCH(request(`credentials/${tenantId}`, "PATCH", { enabled: false }), route(tenantId))).status).toBe(403);
    expect((await POST(request("credentials?scope=product&productId=foreign", "POST", { name: "Jev", provider: "typesafe", apiKey: key }))).status).toBe(404);
    actorId = "agent";
    expect((await GET(request("credentials"))).status).toBe(403);
    expect((await GET(request("credentials?scope=product&productId=product"))).status).toBe(404);
    actorId = null;
    expect((await GET(request("credentials"))).status).toBe(401);
    actorId = "product-admin";
    await saveTaskRouting(db, "prescreening", true, [{ credentialId: productId, model: "jev-latest" }], { scope: "product", productId: "product" });
    expect((await DELETE(request(`credentials/${productId}`, "DELETE"), route(productId))).status).toBe(200);
    expect(await db.query.aiTaskCredentials.findFirst()).toBeUndefined();
  });
});
