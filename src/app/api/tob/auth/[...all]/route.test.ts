import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/response";

const mocks = vi.hoisted(() => ({
  betterAuthUrl: "https://admin.example.com",
  bindCurrentMcpGrantAuthorization: vi.fn(),
  discardMcpAuthorizationCode: vi.fn(),
  enforceStrictRateLimit: vi.fn(),
  hashOAuthToken: vi.fn(),
  isMcpRevocationTokenOwnedByClient: vi.fn(),
  isMcpTokenRequestBound: vi.fn(),
  oauthClientFindFirst: vi.fn(),
  verificationFindFirst: vi.fn(),
  authGet: vi.fn(),
  authPost: vi.fn(),
  mcpRevocationSuccessResponse: vi.fn(),
  normalizeMcpRevocationResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ handler: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: {
      oauthClient: { findFirst: mocks.oauthClientFindFirst },
      verification: { findFirst: mocks.verificationFindFirst },
    },
  }),
  getEnv: () => ({ BETTER_AUTH_URL: mocks.betterAuthUrl }),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceStrictRateLimit: mocks.enforceStrictRateLimit,
}));

vi.mock("@/lib/mcp/grants", () => ({
  bindCurrentMcpGrantAuthorization: mocks.bindCurrentMcpGrantAuthorization,
  discardMcpAuthorizationCode: mocks.discardMcpAuthorizationCode,
  hashOAuthToken: mocks.hashOAuthToken,
  isMcpRevocationTokenOwnedByClient:
    mocks.isMcpRevocationTokenOwnedByClient,
  isMcpTokenRequestBound: mocks.isMcpTokenRequestBound,
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: mocks.authGet, POST: mocks.authPost }),
}));

vi.mock("@/lib/mcp/revocation", () => ({
  mcpRevocationSuccessResponse: mocks.mcpRevocationSuccessResponse,
  normalizeMcpRevocationResponse: mocks.normalizeMcpRevocationResponse,
}));

import { GET, POST } from "./route";

function request(
  path: string,
  options: {
    method?: string;
    contentType?: string;
    body?: string;
    headers?: HeadersInit;
  } = {},
): NextRequest {
  const headers = new Headers(options.headers);
  if (options.contentType) headers.set("content-type", options.contentType);
  return new NextRequest(`https://admin.example.com/api/tob/auth${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

function authorizationRequest(prompt?: string): NextRequest {
  const query = new URLSearchParams({
    client_id: "client-1",
    redirect_uri: "http://127.0.0.1:9876/callback",
    response_type: "code",
    scope: "onfire:mcp offline_access",
    resource: "https://admin.example.com/mcp",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    state: "state-1",
  });
  if (prompt !== undefined) query.set("prompt", prompt);
  return request(`/oauth2/authorize?${query.toString()}`);
}

describe("OAuth provider HTTP surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.betterAuthUrl = "https://admin.example.com";
    mocks.enforceStrictRateLimit.mockResolvedValue(undefined);
    mocks.hashOAuthToken.mockResolvedValue("code-hash");
    mocks.isMcpRevocationTokenOwnedByClient.mockResolvedValue(true);
    mocks.isMcpTokenRequestBound.mockResolvedValue(true);
    mocks.oauthClientFindFirst.mockResolvedValue({
      applicationType: "native",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["http://127.0.0.1:9876/callback"],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });
    mocks.verificationFindFirst.mockResolvedValue({
      value: JSON.stringify({ type: "authorization_code", userId: "user-1" }),
    });
    mocks.bindCurrentMcpGrantAuthorization.mockResolvedValue(true);
    mocks.discardMcpAuthorizationCode.mockResolvedValue(undefined);
    mocks.authGet.mockResolvedValue(Response.json({ ok: true }));
    mocks.authPost.mockResolvedValue(Response.json({ ok: true }));
    mocks.mcpRevocationSuccessResponse.mockImplementation(
      () =>
        new Response(null, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }),
    );
    mocks.normalizeMcpRevocationResponse.mockImplementation(
      async (response: Response) => response,
    );
  });

  it("fails an exposed OAuth request before storage when canonical configuration is invalid", async () => {
    mocks.betterAuthUrl = "not a URL";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(authorizationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "temporarily_unavailable",
    });
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
    expect(mocks.oauthClientFindFirst).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    "/oauth2/userinfo",
    "/oauth2/introspect",
    "/oauth2/public-client?client_id=client-1",
    "/admin/oauth2/create-client",
    "/.well-known/oauth-authorization-server",
  ])("does not expose %s through the auth catch-all", async (path) => {
    const response = await GET(request(path));
    expect(response.status).toBe(404);
  });

  it.each([
    "/oauth2%2Fauthorize",
    "/oauth2%2Fintrospect",
    "/%6Fauth2/introspect",
    "/admin/oauth2%2Fcreate-client",
    "/.well-known%2Foauth-authorization-server",
    "/oauth2%252Fauthorize",
  ])("rejects encoded OAuth path %s without provider dispatch", async (path) => {
    const response = await GET(request(path));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("rejects an encoded token path before POST provider dispatch", async () => {
    const response = await POST(
      request("/oauth2%2Ftoken", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: "grant_type=authorization_code",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("allows each exposed endpoint only on its protocol method", async () => {
    const tokenGet = await GET(request("/oauth2/token"));
    expect(tokenGet.status).toBe(405);
    expect(tokenGet.headers.get("allow")).toBe("POST");
    expect(tokenGet.headers.get("cache-control")).toBe("no-store");

    const authorizePost = await POST(
      request("/oauth2/authorize", { method: "POST" }),
    );
    expect(authorizePost.status).toBe(405);
    expect(authorizePost.headers.get("allow")).toBe("GET");
    expect(authorizePost.headers.get("cache-control")).toBe("no-store");
  });

  it("forces no-store on successful public OAuth responses", async () => {
    const responses = [
      await GET(authorizationRequest()),
      await POST(
        request("/oauth2/token", {
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "client-1",
            code: "valid-code",
            code_verifier: "B".repeat(43),
            redirect_uri: "http://127.0.0.1:9876/callback",
            resource: "https://admin.example.com/mcp",
          }).toString(),
        }),
      ),
      await POST(
        request("/oauth2/register", {
          method: "POST",
          contentType: "application/json",
          body: JSON.stringify({
            redirect_uris: ["http://127.0.0.1:9876/callback"],
            scope: "onfire:mcp",
          }),
        }),
      ),
      await POST(
        request("/oauth2/revoke", {
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: new URLSearchParams({
            client_id: "client-1",
            token: "onfire_at_token",
          }).toString(),
        }),
      ),
    ];

    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
    }
  });

  it("requires one canonical MCP resource and a valid S256 challenge", async () => {
    const validChallenge = "A".repeat(43);
    const validQuery = new URLSearchParams({
      client_id: "client-1",
      response_type: "code",
      resource: "https://admin.example.com/mcp",
      code_challenge: validChallenge,
      code_challenge_method: "S256",
    });

    const invalidChallenge = await GET(
      request(`/oauth2/authorize?${validQuery.toString().replace(validChallenge, "short")}`),
    );
    expect(invalidChallenge.status).toBe(400);
    await expect(invalidChallenge.json()).resolves.toMatchObject({
      error: "invalid_request",
    });

    validQuery.append("code_challenge", validChallenge);
    const duplicateChallenge = await GET(
      request(`/oauth2/authorize?${validQuery.toString()}`),
    );
    expect(duplicateChallenge.status).toBe(400);
    await expect(duplicateChallenge.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(mocks.enforceStrictRateLimit).toHaveBeenCalledTimes(2);
  });

  it("redirects authorization errors only to the client's registered callback", async () => {
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("resource", "https://other.example.com/mcp");

    const response = await GET(new NextRequest(url));
    const callback = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(callback.origin + callback.pathname).toBe(
      "http://127.0.0.1:9876/callback",
    );
    expect(callback.searchParams.get("error")).toBe("invalid_target");
    expect(callback.searchParams.get("state")).toBe("state-1");
    expect(callback.searchParams.get("iss")).toBe(
      "https://admin.example.com/api/tob/auth",
    );
    expect(mocks.enforceStrictRateLimit).toHaveBeenCalledBefore(
      mocks.oauthClientFindFirst,
    );
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("supports RFC 8252 loopback IP port variance for error redirects", async () => {
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", "http://127.0.0.1:43119/callback");
    url.searchParams.set("code_challenge", "short");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "http://127.0.0.1:43119/callback?",
    );
  });

  it.each([
    "http://localhost:43119/callback",
    "http://[::1]:43119/callback",
  ])("supports approved loopback callback host %s", async (redirectUri) => {
    mocks.oauthClientFindFirst.mockResolvedValue({
      applicationType: "native",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [redirectUri.replace("43119", "9876")],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge", "short");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(redirectUri);
  });

  it("does not give web clients the native loopback port exception", async () => {
    mocks.oauthClientFindFirst.mockResolvedValue({
      applicationType: "web",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["http://127.0.0.1:9876/callback"],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", "http://127.0.0.1:43119/callback");
    url.searchParams.set("code_challenge", "short");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("rejects a mismatched callback before a valid request reaches the provider", async () => {
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", "https://attacker.example/callback");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it.each([
    "com.example.app:/oauth2redirect",
    "http://client.example.com/callback",
    "http://127.0.0.2:9876/callback",
  ])("rejects a callback outside the MCP redirect profile: %s", async (redirectUri) => {
    mocks.oauthClientFindFirst.mockResolvedValue({
      applicationType: "native",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [redirectUri],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", redirectUri);

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("fails a persisted client closed when another registered callback is invalid", async () => {
    mocks.oauthClientFindFirst.mockResolvedValue({
      applicationType: "native",
      clientDiscoveryId: null,
      dpopBoundAccessTokens: false,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [
        "http://127.0.0.1:9876/callback",
        "com.example.app:/oauth2redirect",
      ],
      requirePKCE: true,
      responseTypes: ["code"],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });

    const response = await GET(authorizationRequest());

    expect(response.status).toBe(400);
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("does not redirect authorization errors to an unregistered URI", async () => {
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.set("redirect_uri", "https://attacker.example/callback");
    url.searchParams.set("code_challenge", "short");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
  });

  it("fails authorization errors closed when callback validation storage fails", async () => {
    mocks.oauthClientFindFirst.mockRejectedValue(new Error("D1 unavailable"));
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.delete("resource");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: "temporarily_unavailable",
    });
  });

  it("rate limits malformed authorization requests before callback lookup", async () => {
    mocks.enforceStrictRateLimit.mockRejectedValue(
      new ApiError(429, "Too many requests", { retryAfter: 30 }),
    );
    const original = authorizationRequest();
    const url = new URL(original.url);
    url.searchParams.delete("resource");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.oauthClientFindFirst).not.toHaveBeenCalled();
  });

  it("forces interactive authorization through the OnFire consent page", async () => {
    await GET(authorizationRequest());

    const forwarded = mocks.authGet.mock.calls[0]?.[0] as NextRequest;
    expect(new URL(forwarded.url).searchParams.get("prompt")).toBe("consent");
    expect(new URL(forwarded.url).searchParams.get("state")).toBe("state-1");
  });

  it("adds consent to an existing interactive prompt", async () => {
    await GET(authorizationRequest("login"));

    const forwarded = mocks.authGet.mock.calls[0]?.[0] as NextRequest;
    expect(new URL(forwarded.url).searchParams.get("prompt")).toBe(
      "login consent",
    );
  });

  it.each(["none", "consent", "login consent"])(
    "preserves the existing %s prompt",
    async (prompt) => {
      const original = authorizationRequest(prompt);
      await GET(original);

      const forwarded = mocks.authGet.mock.calls[0]?.[0] as NextRequest;
      expect(forwarded).toBe(original);
      expect(new URL(forwarded.url).searchParams.get("prompt")).toBe(prompt);
    },
  );

  it.each([
    { name: "empty", prompts: [""] },
    { name: "duplicate", prompts: ["login", "none"] },
    { name: "invalid delimiter", prompts: ["login\tselect_account"] },
    { name: "none combination", prompts: ["none consent"] },
  ])(
    "rejects an invalid $name prompt before reaching the provider",
    async ({ prompts }) => {
      const original = authorizationRequest();
      const url = new URL(original.url);
      url.searchParams.delete("prompt");
      for (const prompt of prompts) {
        url.searchParams.append("prompt", prompt);
      }

      const response = await GET(new NextRequest(url));

      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!).searchParams.get("error"))
        .toBe("invalid_request");
      expect(mocks.authGet).not.toHaveBeenCalled();
    },
  );

  it.each(["dpop_jkt", "request", "request_uri", "claims", "unknown"])(
    "rejects unsupported authorization parameter %s",
    async (name) => {
      const original = authorizationRequest();
      const url = new URL(original.url);
      url.searchParams.set(name, "A".repeat(43));

      const response = await GET(new NextRequest(url));

      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!).searchParams.get("error"))
        .toBe("invalid_request");
      expect(mocks.authGet).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate and oversized authorization parameters", async () => {
    const duplicate = authorizationRequest();
    const duplicateUrl = new URL(duplicate.url);
    duplicateUrl.searchParams.append("state", "state-2");
    const duplicateResponse = await GET(new NextRequest(duplicateUrl));
    expect(duplicateResponse.status).toBe(302);

    const oversized = authorizationRequest();
    const oversizedUrl = new URL(oversized.url);
    oversizedUrl.searchParams.set("state", "x".repeat(1025));
    const oversizedResponse = await GET(new NextRequest(oversizedUrl));
    expect(oversizedResponse.status).toBe(302);
    const callback = new URL(oversizedResponse.headers.get("location")!);
    expect(callback.searchParams.get("error")).toBe("invalid_request");
    expect(callback.searchParams.get("state")).toBeNull();
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("requires form encoding and the canonical MCP resource at the token endpoint", async () => {
    const jsonResponse = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/json",
        body: "{}",
      }),
    );
    await expect(jsonResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
    });

    const missingResource = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
        body: "grant_type=authorization_code&client_id=client-1",
      }),
    );
    await expect(missingResource.json()).resolves.toMatchObject({
      error: "invalid_target",
    });
  });

  it("rejects an unbound authorization code before token issuance", async () => {
    mocks.isMcpTokenRequestBound.mockResolvedValue(false);

    const response = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "client-1",
          code: "unbound-code",
          code_verifier: "B".repeat(43),
          redirect_uri: "http://127.0.0.1:9876/callback",
          resource: "https://admin.example.com/mcp",
        }).toString(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("returns OAuth temporarily_unavailable when token binding storage fails", async () => {
    mocks.isMcpTokenRequestBound.mockRejectedValue(new Error("D1 unavailable"));

    const response = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "client-1",
          code: "valid-code",
          code_verifier: "B".repeat(43),
          redirect_uri: "http://127.0.0.1:9876/callback",
          resource: "https://admin.example.com/mcp",
        }).toString(),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "temporarily_unavailable",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("returns an OAuth 503 when strict rate limiting cannot reach D1", async () => {
    mocks.enforceStrictRateLimit.mockRejectedValue(new Error("D1 unavailable"));

    const response = await GET(authorizationRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "temporarily_unavailable",
    });
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it.each<{
    name: string;
    headers: Record<string, string>;
    extra: Record<string, string>;
    expected: string;
  }>([
    {
      name: "DPoP header",
      headers: { DPoP: "proof" },
      extra: {},
      expected: "invalid_request",
    },
    {
      name: "Basic authentication",
      headers: { Authorization: "Basic Y2xpZW50OnNlY3JldA==" },
      extra: {},
      expected: "invalid_client",
    },
    {
      name: "client secret",
      headers: {},
      extra: { client_secret: "secret" },
      expected: "invalid_client",
    },
    {
      name: "unknown field",
      headers: {},
      extra: { audience: "https://admin.example.com/mcp" },
      expected: "invalid_request",
    },
  ])("rejects $name at the token endpoint", async ({ headers, extra, expected }) => {
    const response = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        headers,
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "client-1",
          code: "valid-code",
          code_verifier: "B".repeat(43),
          redirect_uri: "http://127.0.0.1:9876/callback",
          resource: "https://admin.example.com/mcp",
          ...extra,
        }).toString(),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ error: expected });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("rejects duplicate token parameters and fields from another grant", async () => {
    const duplicate = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "client-1",
      refresh_token: "onfire_rt_token",
      resource: "https://admin.example.com/mcp",
    });
    duplicate.append("client_id", "client-2");
    const duplicateResponse = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: duplicate.toString(),
      }),
    );
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
    });

    const mixedResponse = await POST(
      request("/oauth2/token", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: "client-1",
          refresh_token: "onfire_rt_token",
          code: "code-from-another-grant",
          resource: "https://admin.example.com/mcp",
        }).toString(),
      }),
    );
    await expect(mixedResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("validates the public revocation request shape before forwarding it", async () => {
    const valid = await POST(
      request("/oauth2/revoke", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({
          client_id: "client-1",
          token: "onfire_at_token",
          token_type_hint: "access_token",
        }).toString(),
      }),
    );
    expect(valid.status).toBe(200);
    expect(mocks.authPost).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeMcpRevocationResponse).toHaveBeenCalledTimes(1);
    const forwarded = mocks.authPost.mock.calls[0]?.[0] as NextRequest;
    await expect(forwarded.text()).resolves.toContain(
      "token_type_hint=access_token",
    );

    const duplicate = new URLSearchParams({
      client_id: "client-1",
      token: "onfire_at_token",
    });
    duplicate.append("token", "onfire_at_other");
    const rejected = await POST(
      request("/oauth2/revoke", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: duplicate.toString(),
      }),
    );
    await expect(rejected.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(mocks.authPost).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      token: "onfire_at_token",
      suppliedHint: "refresh_token",
      expectedHint: "access_token",
    },
    {
      token: "Bearer onfire_rt_token",
      suppliedHint: "access_token",
      expectedHint: "refresh_token",
    },
  ])(
    "derives $expectedHint revocation hints from the token prefix",
    async ({ token, suppliedHint, expectedHint }) => {
      await POST(
        request("/oauth2/revoke", {
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: new URLSearchParams({
            client_id: "client-1",
            token,
            token_type_hint: suppliedHint,
          }).toString(),
        }),
      );

      const forwarded = mocks.authPost.mock.calls[0]?.[0] as NextRequest;
      const form = new URLSearchParams(await forwarded.text());
      expect(form.get("token")).toBe(token.replace(/^Bearer\s+/i, ""));
      expect(form.get("token_type_hint")).toBe(expectedHint);
    },
  );

  it("silently accepts an unknown or wrong-client token before provider revocation", async () => {
    mocks.isMcpRevocationTokenOwnedByClient.mockResolvedValue(false);

    const response = await POST(
      request("/oauth2/revoke", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({
          client_id: "client-1",
          token: "onfire_rt_unknown",
        }).toString(),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("keeps the consent endpoint private to the server-side adapter", async () => {
    const response = await POST(
      request("/oauth2/consent", {
        method: "POST",
        contentType: "application/json",
        body: "{}",
      }),
    );
    expect(response.status).toBe(404);
    expect(mocks.enforceStrictRateLimit).not.toHaveBeenCalled();
  });

  it("binds prompt=none codes to the existing grant", async () => {
    const callback =
      "http://127.0.0.1:9876/callback?code=raw-code&state=state-1&iss=https%3A%2F%2Fadmin.example.com%2Fapi%2Ftob%2Fauth";
    mocks.authGet.mockResolvedValue(
      Response.json({ redirect: true, url: callback }),
    );

    const response = await GET(authorizationRequest("none"));
    const payload = (await response.json()) as { url: string };

    expect(payload.url).toBe(callback);
    expect(mocks.bindCurrentMcpGrantAuthorization).toHaveBeenCalledWith(
      expect.anything(),
      {
        authorizationCodeId: "code-hash",
        userId: "user-1",
        clientId: "client-1",
      },
    );
    expect(mocks.discardMcpAuthorizationCode).not.toHaveBeenCalled();
  });

  it("turns prompt=none into consent_required when no grant exists", async () => {
    mocks.authGet.mockResolvedValue(
      Response.json({
        redirect: true,
        url: "http://127.0.0.1:9876/callback?code=raw-code&state=state-1&iss=https%3A%2F%2Fadmin.example.com%2Fapi%2Ftob%2Fauth",
      }),
    );
    mocks.bindCurrentMcpGrantAuthorization.mockResolvedValue(false);

    const response = await GET(authorizationRequest("none"));
    const payload = (await response.json()) as { url: string };
    const callback = new URL(payload.url);

    expect(callback.searchParams.get("code")).toBeNull();
    expect(callback.searchParams.get("error")).toBe("consent_required");
    expect(callback.searchParams.get("state")).toBe("state-1");
    expect(callback.searchParams.get("iss")).toBe(
      "https://admin.example.com/api/tob/auth",
    );
    expect(mocks.discardMcpAuthorizationCode).toHaveBeenCalledWith(
      expect.anything(),
      "code-hash",
    );
  });

  it("fails prompt=none closed when grant binding cannot be checked", async () => {
    mocks.authGet.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location:
            "http://127.0.0.1:9876/callback?code=raw-code&state=state-1&iss=https%3A%2F%2Fadmin.example.com%2Fapi%2Ftob%2Fauth",
        },
      }),
    );
    mocks.bindCurrentMcpGrantAuthorization.mockRejectedValue(
      new Error("D1 unavailable"),
    );

    const response = await GET(authorizationRequest("none"));
    const callback = new URL(response.headers.get("location") ?? "");

    expect(callback.searchParams.get("code")).toBeNull();
    expect(callback.searchParams.get("error")).toBe(
      "temporarily_unavailable",
    );
    expect(callback.searchParams.get("state")).toBe("state-1");
    expect(callback.searchParams.get("iss")).toBe(
      "https://admin.example.com/api/tob/auth",
    );
  });

  it("rejects DCR metadata that cannot authorize the OnFire MCP resource", async () => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9876/callback"],
          grant_types: ["refresh_token"],
          response_types: ["code"],
          scope: "offline_access",
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("limits DCR callback fan-out before client persistence", async () => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: Array.from(
            { length: 21 },
            (_, index) => `http://127.0.0.1:${9000 + index}/callback`,
          ),
          scope: "onfire:mcp offline_access",
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it.each([
    "com.example.app:/oauth2redirect",
    "http://client.example.com/callback",
    "http://127.0.0.2:9876/callback",
    "https://client.example.com/callback#fragment",
  ])("rejects DCR callback outside the MCP redirect profile: %s", async (redirectUri) => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: [redirectUri],
          scope: "onfire:mcp offline_access",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it.each([
    "https://client.example.com/callback",
    "http://localhost:9876/callback",
    "http://[::1]:9876/callback",
  ])("accepts a DCR callback in the MCP redirect profile: %s", async (redirectUri) => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: [redirectUri],
          scope: "onfire:mcp",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.authPost).toHaveBeenCalledOnce();
  });

  it("rejects a noncanonical DCR resource before client persistence", async () => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9876/callback"],
          scope: "onfire:mcp offline_access",
          resources: ["https://another.example.com/mcp"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it("normalizes DCR to a public native client before persistence", async () => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9876/callback"],
          scope: "onfire:mcp offline_access",
          client_name: "Desktop MCP client",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const forwarded = mocks.authPost.mock.calls[0]?.[0] as NextRequest;
    await expect(forwarded.json()).resolves.toMatchObject({
      redirect_uris: ["http://127.0.0.1:9876/callback"],
      token_endpoint_auth_method: "none",
      application_type: "native",
      require_pkce: true,
      dpop_bound_access_tokens: false,
    });
  });

  it.each([
    { header: "Authorization", value: "Bearer initial-access-token" },
    { header: "DPoP", value: "proof" },
  ])("rejects DCR with a $header header", async ({ header, value }) => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        headers: { [header]: value },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9876/callback"],
          scope: "onfire:mcp offline_access",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.authPost).not.toHaveBeenCalled();
  });

  it.each([
    { token_endpoint_auth_method: "client_secret_post" },
    { require_pkce: false },
    { dpop_bound_access_tokens: true },
    { skip_consent: true },
    { jwks_uri: "https://client.example.com/jwks.json" },
    { software_statement: "signed-registration" },
    { client_uri: "https://user:password@client.example.com" },
  ])("rejects non-public DCR metadata before persistence: %o", async (metadata) => {
    const response = await POST(
      request("/oauth2/register", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9876/callback"],
          scope: "onfire:mcp offline_access",
          ...metadata,
        }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });
});
