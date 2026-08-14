import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";

const mocks = vi.hoisted(() => ({
  betterAuthUrl: "https://admin.example.com",
}));

vi.mock("@/lib/db", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-oauth-signing-secret",
    BETTER_AUTH_URL: mocks.betterAuthUrl,
  }),
}));

import {
  canUseMcpBearerToken,
  hashOAuthToken,
  isUsableMcpAccessToken,
  mcpUnauthorizedResponse,
  parseStringArray,
} from "./grants";
import {
  mcpProtectedResourceMetadata,
  mcpProtectedResourceMetadataResponse,
  sanitizeMcpAuthorizationServerMetadata,
} from "./metadata";
import {
  getMcpAuthorizationServerUrl,
  getMcpResourceMetadataUrl,
  getMcpResourceUrl,
  isCanonicalMcpResource,
  isValidSignedOAuthQuery,
} from "./oauth";

function canonicalize(params: URLSearchParams): string {
  const sorted = [...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
    return 0;
  });
  return new URLSearchParams(sorted).toString();
}

async function signedQuery(
  mutate?: (params: URLSearchParams) => void,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: "client-1",
    exp: String(Math.floor(Date.now() / 1000) + 600),
    scope: "onfire:mcp offline_access",
  });
  mutate?.(params);
  params.set(
    "sig",
    await makeSignature(canonicalize(params), "test-oauth-signing-secret"),
  );
  return params.toString();
}

describe("MCP OAuth helpers", () => {
  beforeAll(() => {
    if (!globalThis.btoa) {
      vi.stubGlobal("btoa", (value: string) =>
        Buffer.from(value, "binary").toString("base64"),
      );
    }
  });

  beforeEach(() => {
    mocks.betterAuthUrl = "https://admin.example.com";
  });

  it("hashes opaque access tokens with Better Auth's base64url SHA-256 format", async () => {
    await expect(hashOAuthToken("abc")).resolves.toBe(
      "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0",
    );
  });

  it("parses Drizzle JSON arrays without trusting malformed values", () => {
    expect(parseStringArray(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(parseStringArray('["a","b"]')).toEqual(["a", "b"]);
    expect(parseStringArray('"[\\"a\\",\\"b\\"]"')).toEqual(["a", "b"]);
    expect(parseStringArray("not-json")).toEqual([]);
  });

  it("accepts only active access tokens bound to the canonical MCP resource", () => {
    const baseToken = {
      confirmation: null,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      revoked: null,
      scopes: ["onfire:mcp", "offline_access"],
      resources: ["https://admin.example.com/mcp"],
    };
    const now = new Date("2029-01-01T00:00:00.000Z").getTime();

    expect(isUsableMcpAccessToken(baseToken, now)).toBe(true);
    expect(
      isUsableMcpAccessToken(
        { ...baseToken, revoked: new Date("2028-01-01T00:00:00.000Z") },
        now,
      ),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken(
        { ...baseToken, scopes: ["onfire:mcp", "unknown"] },
        now,
      ),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken(
        { ...baseToken, scopes: ["onfire:mcp", "onfire:mcp"] },
        now,
      ),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken(
        {
          ...baseToken,
          resources: ["https://admin.example.com/mcp", 1] as never,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken({ ...baseToken, resources: [] }, now),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken(
        { ...baseToken, confirmation: { jkt: "sender-constrained" } },
        now,
      ),
    ).toBe(false);
    expect(
      isUsableMcpAccessToken(
        {
          ...baseToken,
          resources: [
            "https://admin.example.com/mcp",
            "https://admin.example.com/other",
          ],
        },
        now,
      ),
    ).toBe(false);
  });

  it("verifies the exact provider-signed consent query", async () => {
    const valid = await signedQuery();
    await expect(isValidSignedOAuthQuery(valid)).resolves.toBe(true);

    const tampered = new URLSearchParams(valid);
    tampered.set("client_id", "attacker-client");
    await expect(isValidSignedOAuthQuery(tampered.toString())).resolves.toBe(
      false,
    );

    const duplicateExpiration = new URLSearchParams(
      await signedQuery((params) => params.append("exp", "9999999999")),
    );
    await expect(
      isValidSignedOAuthQuery(duplicateExpiration.toString()),
    ).resolves.toBe(false);

    await expect(
      isValidSignedOAuthQuery(
        await signedQuery((params) =>
          params.set("exp", String(Math.floor(Date.now() / 1000) - 1)),
        ),
      ),
    ).resolves.toBe(false);
  });

  it("rejects disabled and DPoP-bound clients on the Bearer-only MCP endpoint", () => {
    const client = {
      applicationType: "native",
      clientSecret: null,
      clientDiscoveryId: null,
      disabled: false,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["http://127.0.0.1:9876/callback"],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    };
    expect(
      canUseMcpBearerToken(client),
    ).toBe(true);
    expect(
      canUseMcpBearerToken({ ...client, disabled: true }),
    ).toBe(false);
    expect(
      canUseMcpBearerToken({ ...client, dpopBoundAccessTokens: true }),
    ).toBe(false);
    expect(
      canUseMcpBearerToken({
        ...client,
        redirectUris: ["com.example.app:/oauth2redirect"],
      }),
    ).toBe(false);
  });

  it("rejects oversized bearer credentials before token lookup", async () => {
    const { authenticateMcpRequestWithDb } = await import("./grants");
    const findFirst = vi.fn();
    const context = await authenticateMcpRequestWithDb(
      { query: { oauthAccessToken: { findFirst } } } as never,
      new Request("https://admin.example.com/mcp", {
        headers: { Authorization: `Bearer ${"x".repeat(4096)}` },
      }),
    );

    expect(context).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("requires the exact canonical MCP resource indicator", () => {
    expect(getMcpResourceUrl()).toBe("https://admin.example.com/mcp");
    expect(isCanonicalMcpResource("https://admin.example.com/mcp")).toBe(true);
    expect(isCanonicalMcpResource("https://ADMIN.example.com/mcp")).toBe(true);
    expect(isCanonicalMcpResource("https://admin.example.com/mcp/")).toBe(false);
    expect(isCanonicalMcpResource("https://admin.example.com/mcp?x=1")).toBe(false);
    expect(isCanonicalMcpResource("https://support.example.com/mcp")).toBe(false);
  });

  it.each([
    "ftp://admin.example.com",
    "https://user:password@admin.example.com",
    "https://admin.example.com?tenant=other",
    " https://admin.example.com",
  ])("rejects invalid canonical ToB URL configuration %s", (value) => {
    mocks.betterAuthUrl = value;
    expect(() => getMcpResourceUrl()).toThrow();
    expect(() => getMcpAuthorizationServerUrl()).toThrow();
  });

  it("publishes RFC 9728 resource metadata for the ToB authorization server", () => {
    expect(getMcpAuthorizationServerUrl()).toBe(
      "https://admin.example.com/api/tob/auth",
    );
    expect(getMcpResourceMetadataUrl()).toBe(
      "https://admin.example.com/.well-known/oauth-protected-resource/mcp",
    );
    expect(mcpProtectedResourceMetadata()).toEqual({
      resource: "https://admin.example.com/mcp",
      authorization_servers: ["https://admin.example.com/api/tob/auth"],
      scopes_supported: ["onfire:mcp"],
      bearer_methods_supported: ["header"],
      resource_name: "OnFire MCP",
    });
  });

  it("challenges only for the MCP resource scope", () => {
    const response = mcpUnauthorizedResponse();
    expect(response.headers.get("www-authenticate")).toContain(
      'scope="onfire:mcp"',
    );
    expect(response.headers.get("www-authenticate")).not.toContain(
      "offline_access",
    );
  });

  it("fails closed when canonical metadata URLs cannot be derived", () => {
    mocks.betterAuthUrl = "not a URL";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const challenge = mcpUnauthorizedResponse();
    const metadata = mcpProtectedResourceMetadataResponse();

    expect(challenge.status).toBe(503);
    expect(challenge.headers.get("www-authenticate")).toBeNull();
    expect(metadata.status).toBe(503);
    expect(metadata.headers.get("cache-control")).toBe("no-store");
    log.mockRestore();
  });

  it("does not advertise the blocked introspection endpoint", () => {
    expect(
      sanitizeMcpAuthorizationServerMetadata({
        issuer: "https://admin.example.com/api/tob/auth",
        scopes_supported: ["onfire:mcp"],
        introspection_endpoint:
          "https://admin.example.com/api/tob/auth/oauth2/introspect",
        introspection_endpoint_auth_methods_supported: ["client_secret_post"],
      }),
    ).toEqual({
      issuer: "https://admin.example.com/api/tob/auth",
      authorization_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/authorize",
      token_endpoint: "https://admin.example.com/api/tob/auth/oauth2/token",
      registration_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/register",
      revocation_endpoint:
        "https://admin.example.com/api/tob/auth/oauth2/revoke",
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["onfire:mcp", "offline_access"],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    });
  });
});
