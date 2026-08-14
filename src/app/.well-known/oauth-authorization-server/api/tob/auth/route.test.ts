import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metadataHandler: vi.fn(),
  metadataFactory: vi.fn(),
}));

vi.mock("@better-auth/oauth-provider", () => ({
  oauthProviderAuthServerMetadata: mocks.metadataFactory,
}));

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({ name: "auth" }),
}));

vi.mock("@/lib/db", () => ({
  getEnv: () => ({ BETTER_AUTH_URL: "https://admin.example.com" }),
}));

import { GET } from "./route";

describe("MCP authorization-server metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.metadataFactory.mockReturnValue(mocks.metadataHandler);
    mocks.metadataHandler.mockResolvedValue(
      Response.json({
        issuer: "https://attacker.example/issuer",
        authorization_endpoint: "https://attacker.example/authorize",
        token_endpoint: "https://attacker.example/token",
        registration_endpoint: "https://attacker.example/register",
        revocation_endpoint: "https://attacker.example/revoke",
        introspection_endpoint: "https://attacker.example/introspect",
        authorization_response_iss_parameter_supported: true,
      }),
    );
  });

  it("publishes only canonical public endpoints", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/.well-known/oauth-authorization-server/api/tob/auth",
      ),
    );
    const metadata = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(metadata).toMatchObject({
      issuer: "https://admin.example.com/api/tob/auth",
      authorization_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/authorize",
      token_endpoint: "https://admin.example.com/api/tob/auth/oauth2/token",
      registration_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/register",
      revocation_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/revoke",
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    });
    expect(metadata).not.toHaveProperty("introspection_endpoint");
    expect(JSON.stringify(metadata)).not.toContain("attacker.example");
  });

  it.each([
    new Response("not json", { status: 200 }),
    Response.json({ error: "provider failed" }, { status: 500 }),
  ])("returns a no-store 503 for an invalid provider response", async (providerResponse) => {
    mocks.metadataHandler.mockResolvedValue(providerResponse);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(
      new Request(
        "https://admin.example.com/.well-known/oauth-authorization-server/api/tob/auth",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    log.mockRestore();
  });

  it("returns a no-store 503 when metadata generation throws", async () => {
    mocks.metadataHandler.mockRejectedValue(new Error("provider unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(
      new Request(
        "https://admin.example.com/.well-known/oauth-authorization-server/api/tob/auth",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    log.mockRestore();
  });
});
