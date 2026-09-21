import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { aiCredentials, aiUsageDaily, aiUsageEvents, products, tenants, users, userProducts } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { Role } from "@/lib/types";
import { listUsageDaily, recordAiUsage } from "@/services/ai/usage";
import { GET } from "@/app/api/tob/admin/ai/usage/route";
import { createTestDb } from "./test-db";

let db: Database;
let actorId: string | null;
vi.mock("@/lib/db", () => ({ getDb: () => db, getEnv: () => ({ AUTH_SECRET: "usage-test-secret" }) }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: async () => actorId ? { user: { id: actorId } } : null } }) }));
const query = { from: "2000-01-01", to: "2099-12-31" };
const usageResponse = z.object({ data: z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  totals: z.object({ requestCount: z.number(), promptTokens: z.number(), completionTokens: z.number(), totalTokens: z.number() }),
}) });
const input = {
  credentialId: "primary", taskType: "agent" as const, productId: "product",
  model: "model-a", provider: "openai" as const,
  promptTokens: 10, completionTokens: 5, totalTokens: 15, success: true,
};
const request = (scope: string) => new NextRequest(`https://admin.example.com/api/tob/admin/ai/usage?from=${query.from}&to=${query.to}&${scope}`);

beforeEach(async () => {
  db = await createTestDb(); actorId = "super";
  await db.insert(tenants).values([{ id: "tenant", name: "Tenant" }, { id: "other", name: "Other" }]);
  await db.insert(products).values([{ id: "product", tenantId: "tenant", name: "Product" }, { id: "foreign", tenantId: "other", name: "Other" }]);
  await db.insert(users).values([
    { id: "super", email: "super@example.test", displayName: "Super", role: Role.SuperAdmin, tenantId: "tenant" },
    { id: "product-admin", email: "product@example.test", displayName: "Admin", role: Role.ProductAdmin, tenantId: "tenant" },
  ]);
  await db.insert(userProducts).values({ userId: "product-admin", productId: "product" });
  await db.insert(aiCredentials).values({
    id: "primary", name: "Shared credential", provider: "openai", apiKey: "never-expose-this",
    secretPurpose: "test", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
});

describe("model-level AI usage", () => {
  it("separates models, credentials, providers and tasks while incrementing repeated calls in every scope", async () => {
    await recordAiUsage(db, input);
    await recordAiUsage(db, input);
    await recordAiUsage(db, { ...input, model: "model-b" });
    await recordAiUsage(db, { ...input, credentialId: "secondary" });
    await recordAiUsage(db, { ...input, provider: "openrouter" });
    await recordAiUsage(db, { ...input, taskType: "translation" });
    for (const dimension of ["system", "tenant", "product"] as const) {
      const rows = await listUsageDaily(db, { ...query, dimension, tenantId: "tenant", productId: "product" });
      expect(rows).toHaveLength(5);
      expect(rows.reduce((sum, row) => sum + row.totalTokens, 0)).toBe(90);
      expect(rows.find((row) => row.credentialId === "primary" && row.model === "model-a" && row.provider === "openai" && row.taskType === "agent"))
        .toMatchObject({ credentialName: "Shared credential", requestCount: 2, promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    }
    expect(await db.select().from(aiUsageEvents)).toHaveLength(6);
    expect(await db.select().from(aiUsageDaily)).toHaveLength(15);
  });

  it("preserves usage after credential deletion and does not expose credential secrets", async () => {
    await recordAiUsage(db, input);
    const before = await GET(request("dimension=system"));
    expect(before.status).toBe(200);
    const payload = usageResponse.parse(await before.json());
    expect(payload.data.items[0]).toMatchObject({ model: "model-a", provider: "openai", credentialName: "Shared credential" });
    expect(JSON.stringify(payload)).not.toContain("never-expose-this");
    expect(payload.data.items[0]).not.toHaveProperty("apiKey");
    await db.delete(aiCredentials).where(eq(aiCredentials.id, "primary"));
    const after = await GET(request("dimension=system&credentialId=primary"));
    const deleted = usageResponse.parse(await after.json());
    expect(deleted.data.items[0]).toMatchObject({ credentialId: "primary", credentialName: null, model: "model-a" });
    expect(deleted.data.totals).toEqual({ requestCount: 1, promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  it("keeps inherited credential usage within the requested authorized product", async () => {
    await recordAiUsage(db, input);
    await recordAiUsage(db, { ...input, productId: "foreign", model: "private-model" });
    actorId = "product-admin";
    const response = await GET(request("dimension=product&productId=product"));
    expect(response.status).toBe(200);
    const payload = usageResponse.parse(await response.json());
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.totals.totalTokens).toBe(15);
    expect(JSON.stringify(payload)).not.toContain("private-model");
    expect((await GET(request("dimension=system"))).status).toBe(403);
    expect((await GET(request("dimension=tenant&tenantId=other"))).status).toBe(403);
    expect((await GET(request("dimension=product&productId=foreign"))).status).toBe(404);
  });
});
