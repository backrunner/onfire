import { describe, expect, it, vi } from "vitest";
import type { SpamFilterConfigRow, SpamFilterProvider } from "@/drizzle/schema";
import { sealSecret } from "@/lib/secret-storage";
import { runExternalSpamFilter } from "./spam-filter";

vi.mock("@/lib/db", () => ({
  getEnv: () => ({ AUTH_SECRET: "test-secret" }),
}));

const seal = (value: string) =>
  sealSecret(value, "test-secret", "spam-filter:global:auth");

const config = (
  endpointUrl: string | null,
  provider: SpamFilterProvider = "custom",
  authSecret: string | null = null
): SpamFilterConfigRow => ({
  id: "spam-1",
  scopeKey: "global",
  scope: "global",
  tenantId: null,
  mode: "custom",
  provider,
  endpointUrl,
  authSecret,
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
  it("uses the bounded JSON protocol for custom endpoints", async () => {
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
    ).resolves.toMatchObject({ verdict: "suspect", score: 0.42, provider: "custom" });
  });

  it("rejects private and redirecting custom endpoints", async () => {
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

  it("maps Akismet true and discard to spam", async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe("https://rest.akismet.com/1.1/comment-check");
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("api_key=akismet-key");
      expect(body).toContain("blog=https%3A%2F%2Fsupport.example.com%2F");
      return new Response("true", {
        headers: { "content-type": "text/plain", "x-akismet-pro-tip": "discard" },
      });
    });
    await expect(
      runExternalSpamFilter(
        config("https://support.example.com/", "akismet", await seal("akismet-key")),
        input,
        fetchMock as typeof fetch
      )
    ).resolves.toMatchObject({ verdict: "spam", score: 1, provider: "akismet" });
  });

  it("maps OOPSpam scores onto allow/suspect/spam", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-api-key")).toBe("oopspam-key");
      return new Response(JSON.stringify({ Score: 3, Details: { isContentSpam: "nospam" } }), {
        headers: { "content-type": "application/json" },
      });
    });
    await expect(
      runExternalSpamFilter(
        config(null, "oopspam", await seal("oopspam-key")),
        input,
        fetchMock as typeof fetch
      )
    ).resolves.toMatchObject({ verdict: "suspect", provider: "oopspam" });
  });

  it("maps Postmark SpamAssassin scores without a secret", async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe("https://spamcheck.postmarkapp.com/filter");
      const body = JSON.parse(String(init?.body)) as { email: string; options: string };
      expect(body.options).toBe("short");
      expect(body.email).toContain("Need help");
      return new Response(JSON.stringify({ success: true, score: "5.4" }), {
        headers: { "content-type": "application/json" },
      });
    });
    await expect(
      runExternalSpamFilter(config(null, "postmark"), input, fetchMock as typeof fetch)
    ).resolves.toMatchObject({ verdict: "spam", provider: "postmark" });
  });

  it("looks up the sender email with Stop Forum Spam", async () => {
    const fetchMock = vi.fn(async (url: URL | RequestInfo) => {
      const parsed = new URL(String(url));
      expect(parsed.origin + parsed.pathname).toBe("https://api.stopforumspam.org/api");
      expect(parsed.searchParams.get("email")).toBe("customer@example.com");
      expect(parsed.searchParams.has("json")).toBe(true);
      return new Response(
        JSON.stringify({ success: 1, email: { appears: 1, confidence: 96.5 } }),
        { headers: { "content-type": "application/json" } }
      );
    });
    await expect(
      runExternalSpamFilter(config(null, "stopforumspam"), input, fetchMock as typeof fetch)
    ).resolves.toMatchObject({ verdict: "spam", provider: "stopforumspam" });
  });
});
