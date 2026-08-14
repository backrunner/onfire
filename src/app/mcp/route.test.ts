import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/response";

const mocks = vi.hoisted(() => ({
  authenticateMcpRequest: vi.fn(),
  betterAuthUrl: "https://admin.example.com",
  enforceStrictRateLimit: vi.fn(),
  mcpUnauthorizedResponse: vi.fn(),
}));

const publicDb = { name: "public-db" };

vi.mock("@/lib/db", () => ({
  getDb: () => publicDb,
  getEnv: () => ({ BETTER_AUTH_URL: mocks.betterAuthUrl }),
}));

vi.mock("@/lib/mcp/grants", () => ({
  authenticateMcpRequest: mocks.authenticateMcpRequest,
  mcpUnauthorizedResponse: mocks.mcpUnauthorizedResponse,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceStrictRateLimit: mocks.enforceStrictRateLimit,
}));

import { GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route";

function request(
  method: "GET" | "POST" = "POST",
  contentType = "application/json",
  origin?: string,
): NextRequest {
  const headers = new Headers({
    Authorization: "Bearer onfire_at_test",
    "Content-Type": contentType,
    "CF-Connecting-IP": "203.0.113.9",
  });
  if (origin !== undefined) headers.set("Origin", origin);
  return new NextRequest("https://admin.example.com/mcp", {
    method,
    headers,
    body: method === "POST" ? "{}" : undefined,
  });
}

describe("MCP HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.betterAuthUrl = "https://admin.example.com";
    mocks.enforceStrictRateLimit.mockResolvedValue(undefined);
    mocks.authenticateMcpRequest.mockResolvedValue(null);
    mocks.mcpUnauthorizedResponse.mockReturnValue(
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );
  });

  it.each([
    ["POST", POST, request("POST")],
    ["GET", GET, request("GET")],
  ] as const)(
    "returns 503 for %s before rate limiting when the canonical URL is invalid",
    async (_method, handler, invalidRequest) => {
      mocks.betterAuthUrl = "not a URL";
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const response = await handler(invalidRequest);

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
      expect(mocks.authenticateMcpRequest).not.toHaveBeenCalled();
      log.mockRestore();
    },
  );

  it("rate limits by public IP before bearer-token database lookup", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(mocks.enforceStrictRateLimit).toHaveBeenCalledWith(
      publicDb,
      expect.any(NextRequest),
      "mcp:public",
      { limit: 600, windowSeconds: 60 },
      undefined,
    );
    expect(mocks.authenticateMcpRequest).toHaveBeenCalledOnce();
  });

  it.each(["null", "https://attacker.example", "not a URL"])(
    "rejects invalid Origin %s before rate limiting or token lookup",
    async (origin) => {
      const response = await POST(request("POST", "application/json", origin));

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      await expect(response.json()).resolves.toMatchObject({
        jsonrpc: "2.0",
        error: { message: "Forbidden origin" },
        id: null,
      });
      expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
      expect(mocks.authenticateMcpRequest).not.toHaveBeenCalled();
    },
  );

  it("allows the exact canonical Origin", async () => {
    const response = await POST(
      request("POST", "application/json", "https://admin.example.com"),
    );

    expect(response.status).toBe(401);
    expect(mocks.enforceStrictRateLimit).toHaveBeenCalledOnce();
    expect(mocks.authenticateMcpRequest).toHaveBeenCalledOnce();
  });

  it("fails closed before authentication when public rate-limit storage fails", async () => {
    mocks.enforceStrictRateLimit.mockRejectedValueOnce(
      new ApiError(503, "Service temporarily unavailable"),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.authenticateMcpRequest).not.toHaveBeenCalled();
  });

  it("returns 503 when bearer authentication storage fails", async () => {
    mocks.authenticateMcpRequest.mockRejectedValue(new Error("D1 unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Service temporarily unavailable" },
    });
  });

  it("applies a second limit to the authenticated grant", async () => {
    const grantDb = { name: "grant-db" };
    mocks.authenticateMcpRequest.mockResolvedValue({
      db: grantDb,
      grant: { id: "grant-1" },
    });
    mocks.enforceStrictRateLimit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new ApiError(429, "Too many requests", { retryAfter: 17 }),
      );

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(mocks.enforceStrictRateLimit).toHaveBeenNthCalledWith(
      2,
      grantDb,
      expect.any(NextRequest),
      "mcp:request",
      { limit: 120, windowSeconds: 60 },
      "grant-1",
    );
  });

  it("rejects non-JSON MCP requests before protocol parsing", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({
      db: { name: "grant-db" },
      grant: { id: "grant-1" },
    });

    const response = await POST(request("POST", "text/plain"));

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "application/json request body required" },
    });
  });

  it("also protects unsupported GET requests before token lookup", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(mocks.enforceStrictRateLimit).toHaveBeenCalledWith(
      publicDb,
      expect.any(NextRequest),
      "mcp:public",
      { limit: 600, windowSeconds: 60 },
      undefined,
    );
  });

  it("validates Origin for unsupported GET before authentication", async () => {
    const response = await GET(
      request("GET", "application/json", "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticateMcpRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
    ["PATCH", PATCH],
    ["PUT", PUT],
  ] as const)("validates Origin for unsupported %s requests", async (_, handler) => {
    const crossOrigin = new NextRequest("https://admin.example.com/mcp", {
      method: _,
      headers: { Origin: "https://attacker.example" },
    });

    const response = await handler(crossOrigin);

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticateMcpRequest).not.toHaveBeenCalled();
  });

  it("applies the authenticated grant limit before returning GET 405", async () => {
    const grantDb = { name: "grant-db" };
    mocks.authenticateMcpRequest.mockResolvedValue({
      db: grantDb,
      grant: { id: "grant-1" },
    });

    const response = await GET(request("GET"));

    expect(response.status).toBe(405);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.enforceStrictRateLimit).toHaveBeenNthCalledWith(
      2,
      grantDb,
      expect.any(NextRequest),
      "mcp:request",
      { limit: 120, windowSeconds: 60 },
      "grant-1",
    );
  });

  it("fails closed when the authenticated grant limit rejects GET", async () => {
    mocks.authenticateMcpRequest.mockResolvedValue({
      db: { name: "grant-db" },
      grant: { id: "grant-1" },
    });
    mocks.enforceStrictRateLimit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError(503, "Service temporarily unavailable"));

    const response = await GET(request("GET"));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
