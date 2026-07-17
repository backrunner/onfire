import { describe, expect, it, vi } from "vitest";
import type { SpamFilterConfigRow } from "@/drizzle/schema";
import { runExternalSpamFilter } from "./spam-filter";

const config = (endpointUrl: string): SpamFilterConfigRow => ({
  id: "spam-1",
  scopeKey: "global",
  scope: "global",
  tenantId: null,
  mode: "custom",
  endpointUrl,
  authSecret: null,
  timeoutMs: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const input = {
  messageId: "<message@example.com>",
  fromEmail: "customer@example.com",
  toEmail: "support@example.com",
  subject: "Need help",
  content: "The application is not working.",
};

describe("external spam filter", () => {
  it("uses the bounded JSON protocol", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("x-onfire-spam-protocol")).toBe(
        "onfire-spam-v1"
      );
      return new Response(
        JSON.stringify({ verdict: "suspect", score: 0.42, reason: "Review" }),
        { headers: { "content-type": "application/json" } }
      );
    });
    await expect(
      runExternalSpamFilter(config("https://spam.example.com/classify"), input, fetchMock as typeof fetch)
    ).resolves.toMatchObject({ verdict: "suspect", score: 0.42, provider: "global" });
  });

  it("rejects private and redirecting endpoints", async () => {
    await expect(
      runExternalSpamFilter(config("https://127.0.0.1/classify"), input, vi.fn() as typeof fetch)
    ).rejects.toThrow(/unsafe/i);
    await expect(
      runExternalSpamFilter(
        config("https://spam.example.com/classify"),
        input,
        vi.fn(async () => new Response(null, { status: 302 })) as typeof fetch
      )
    ).rejects.toThrow(/redirect/i);
  });
});

