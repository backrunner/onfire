import { describe, expect, it } from "vitest";
import { aiScopeKey, parseAiScopeKey, usageDailyBucketKey } from "./ai-scope";

describe("AI scope keys", () => {
  it("builds and parses system, tenant, and product keys", () => {
    expect(aiScopeKey({ scope: "system" })).toBe("system");
    expect(aiScopeKey({ scope: "tenant", tenantId: "t1" })).toBe("tenant:t1");
    expect(aiScopeKey({ scope: "product", productId: "p1" })).toBe("product:p1");
    expect(parseAiScopeKey("system")).toEqual({ scope: "system" });
    expect(parseAiScopeKey("tenant:t1")).toEqual({ scope: "tenant", tenantId: "t1" });
    expect(parseAiScopeKey("product:p1")).toEqual({ scope: "product", productId: "p1" });
  });

  it("keeps daily usage buckets unique across dimensions", () => {
    expect(
      usageDailyBucketKey({
        day: "2026-08-16",
        dimension: "system",
        credentialId: "c1",
        taskType: "agent",
      })
    ).toBe("2026-08-16|system|||c1|agent");
    expect(
      usageDailyBucketKey({
        day: "2026-08-16",
        dimension: "product",
        tenantId: "t1",
        productId: "p1",
        credentialId: "c1",
        taskType: "agent",
      })
    ).toBe("2026-08-16|product|t1|p1|c1|agent");
  });
});
