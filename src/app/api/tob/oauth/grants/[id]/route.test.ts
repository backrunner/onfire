import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authContext: {} as Record<string, unknown>,
  findFirst: vi.fn(),
  revokeMcpGrant: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  withAuth:
    (_options: unknown, handler: (request: NextRequest, ctx: unknown) => unknown) =>
    (request: NextRequest) =>
      request.headers.get("x-test-auth") === "deny"
        ? Response.json({ error: "Unauthorized" }, { status: 401 })
        : handler(request, mocks.authContext),
}));

vi.mock("@/lib/db", () => ({
  getEnv: () => ({ BETTER_AUTH_URL: "https://admin.example.com" }),
}));

vi.mock("@/lib/mcp/grants", () => ({
  revokeMcpGrant: mocks.revokeMcpGrant,
}));

import { DELETE } from "./route";

function revocationRequest(origin?: string, denyAuth = false): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (denyAuth) headers.set("x-test-auth", "deny");
  return new NextRequest(
    "https://admin.example.com/api/tob/oauth/grants/grant-1",
    { method: "DELETE", headers },
  );
}

describe("connected MCP application revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = {
      db: { query: { mcpOauthGrants: { findFirst: mocks.findFirst } } },
      params: { id: "grant-1" },
      user: { id: "user-1" },
    };
    mocks.findFirst.mockResolvedValue({
      id: "grant-1",
      userId: "user-1",
      clientId: "client-1",
    });
    mocks.revokeMcpGrant.mockResolvedValue(undefined);
  });

  it("requires the canonical origin before touching grant state", async () => {
    await expect(DELETE(revocationRequest())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      DELETE(revocationRequest("https://attacker.example")),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.revokeMcpGrant).not.toHaveBeenCalled();
  });

  it("revokes the current user's grant from the canonical origin", async () => {
    const response = await DELETE(
      revocationRequest("https://admin.example.com"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.revokeMcpGrant).toHaveBeenCalledWith(
      mocks.authContext.db,
      expect.objectContaining({ id: "grant-1", userId: "user-1" }),
    );
  });

  it("forces no-store on handled authorization failures", async () => {
    const response = await DELETE(revocationRequest(undefined, true));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
