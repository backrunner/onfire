import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { rateLimits } from "@/drizzle/schema";
import { createTestDb } from "./test-db";

const state = vi.hoisted(() => ({
  db: null as Database | null,
  handler: vi.fn(),
  unavailable: false,
}));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    if (state.unavailable) throw new Error("D1 unavailable");
    return state.db;
  },
  getEnv: () => ({
    AUTH_SECRET: "login-protection-test-secret-at-least-32-characters",
    BETTER_AUTH_URL: "https://admin.example.com",
  }),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ handler: state.handler }) }));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: state.handler, POST: state.handler }),
}));

import { GET, POST } from "@/app/api/tob/auth/[...all]/route";
import { purgeExpiredLoginLimits } from "@/lib/auth/login-protection";

function request(email = "agent@example.com", ip = "203.0.113.1", path = "/sign-in/email") {
  return new NextRequest(`https://admin.example.com/api/tob/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ email, password: "wrong-password", code: "000000" }),
  });
}

beforeEach(async () => {
  state.db = await createTestDb();
  state.unavailable = false;
  state.handler.mockReset().mockImplementation(() =>
    Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 }));
});
afterEach(() => vi.restoreAllMocks());

describe("ToB login protection through the HTTP auth route", () => {
  it("shares account attempts across IPs, casing, whitespace and trailing slashes", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(request("Agent@example.com", `203.0.113.${i}`))).status).toBe(401);
    }
    const blocked = await POST(request(" agent@EXAMPLE.com ", "198.51.100.1", "/sign-in/email/"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(blocked.headers.get("pragma")).toBe("no-cache");
    expect(await blocked.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(state.handler).toHaveBeenCalledTimes(10);
    const rows = await state.db!.select().from(rateLimits);
    expect(rows.filter((row) => row.key.startsWith("tob:login:account:"))).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("example.com");
    expect(JSON.stringify(rows)).not.toContain("wrong-password");
  });

  it("atomically admits only ten concurrent account attempts", async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      POST(request("agent@example.com", `203.0.113.${i}`))));
    expect(responses.filter((response) => response.status === 401)).toHaveLength(10);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(10);
    expect(state.handler).toHaveBeenCalledTimes(10);
  });

  it("limits password spraying across accounts and all authentication methods", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await POST(request(`agent${i}@example.com`))).status).toBe(401);
    }
    for (const path of ["/sign-in/email", "/two-factor/verify-totp", "/two-factor/verify-backup-code", "/passkey/verify-authentication"]) {
      expect((await POST(request("another@example.com", "203.0.113.1", path))).status).toBe(429);
    }
    const options = new NextRequest("https://admin.example.com/api/tob/auth/passkey/generate-authenticate-options", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    });
    expect((await GET(options)).status).toBe(429);
    expect(state.handler).toHaveBeenCalledTimes(30);
    expect((await POST(request("another@example.com", "198.51.100.1"))).status).toBe(401);
  });

  it("does not let a forged forwarding header escape the shared missing-IP bucket", async () => {
    for (let i = 0; i < 31; i++) {
      const req = request(`agent${i}@example.com`);
      req.headers.delete("cf-connecting-ip");
      req.headers.set("x-forwarded-for", `203.0.113.${i}`);
      req.headers.set("x-real-ip", `203.0.113.${i}`);
      expect((await POST(req)).status).toBe(i < 30 ? 401 : 429);
    }
  });

  it("retains the longer IP budget across minute resets", async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, "now");
    for (let i = 0; i < 101; i++) {
      clock.mockReturnValue(start + Math.floor(i / 25) * 61_000);
      expect((await POST(request(`agent${i}@example.com`))).status).toBe(i < 100 ? 401 : 429);
    }
  });

  it("allows retry after expiry without extending the lock on denied requests", async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    for (let i = 0; i < 10; i++) await POST(request());
    clock.mockReturnValue(start + 899_000);
    const blocked = await POST(request());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("1");
    clock.mockReturnValue(start + 900_000);
    expect((await POST(request())).status).toBe(401);
  });

  it("fails closed before auth dispatch when D1 is unavailable or writes fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.unavailable = true;
    expect((await POST(request())).status).toBe(503);
    state.unavailable = false;
    vi.spyOn(state.db!, "insert").mockImplementation(() => { throw new Error("D1 write failed"); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.handler).not.toHaveBeenCalled();
  });

  it.each(["/sign-in%2Femail", "/%73ign-in/email", "/sign-in//email"])("rejects path alias %s", async (path) => {
    expect([400, 404]).toContain((await POST(request("agent@example.com", "203.0.113.1", path))).status);
    expect(state.handler).not.toHaveBeenCalled();
  });

  it("rejects malformed, alternate-format and oversized bodies before authentication", async () => {
    for (const [body, contentType, status] of [
      ["{", "application/json", 400],
      ['{"email":[]}', "application/json", 400],
      ["email=agent%40example.com&password=wrong", "application/x-www-form-urlencoded", 415],
      [JSON.stringify({ email: "agent@example.com", password: "x".repeat(17000) }), "application/json", 413],
    ] as const) {
      const req = new NextRequest("https://admin.example.com/api/tob/auth/sign-in/email", {
        method: "POST", headers: { "content-type": contentType }, body,
      });
      expect((await POST(req)).status).toBe(status);
    }
    expect(state.handler).not.toHaveBeenCalled();
  });

  it("preserves successful auth payloads, cookies and OAuth continuation", async () => {
    state.handler.mockImplementation(async (req: NextRequest) => {
      expect(await req.json()).toMatchObject({ email: "agent@example.com", password: "wrong-password" });
      return Response.json({ url: "https://admin.example.com/api/tob/auth/oauth2/authorize?state=example" }, {
        headers: { "set-cookie": "session=example; HttpOnly; Secure" },
      });
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=example");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toHaveProperty("url");
  });

  it("keeps session reads available even when login is rate limited", async () => {
    for (let i = 0; i < 10; i++) await POST(request());
    expect((await POST(request())).status).toBe(429);
    state.handler.mockImplementation(() => Response.json({ user: null }));
    const response = await GET(new NextRequest("https://admin.example.com/api/tob/auth/get-session"));
    expect(response.status).toBe(200);
  });

  it("purges only expired login counters, preserving active counters and other scopes", async () => {
    await POST(request());
    await state.db!.insert(rateLimits).values([
      { key: "tob:login:account:expired", count: 10, resetAt: Date.now() - 1000 },
      { key: "install:lock", count: 1, resetAt: Date.now() - 1000 },
    ]);
    await purgeExpiredLoginLimits(state.db!);
    expect(await state.db!.select().from(rateLimits).where(eq(rateLimits.key, "tob:login:account:expired"))).toHaveLength(0);
    expect(await state.db!.select().from(rateLimits)).toHaveLength(4);
  });
});
