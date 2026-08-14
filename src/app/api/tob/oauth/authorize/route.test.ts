import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError as BetterAuthApiError } from "better-auth";
import { NextRequest, type NextResponse } from "next/server";

type TestHandler = (
  request: NextRequest,
  context: Record<string, never>,
) => Promise<NextResponse>;

const mocks = vi.hoisted(() => ({
  authContext: {} as Record<string, unknown>,
  discardMcpAuthorizationCode: vi.fn(),
  hashOAuthToken: vi.fn(),
  isValidSignedOAuthQuery: vi.fn(),
  oauth2Consent: vi.fn(),
  parseBody: vi.fn(),
  parseQuery: vi.fn(),
  saveMcpGrant: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  parseBody: mocks.parseBody,
  parseQuery: mocks.parseQuery,
  withAuth:
    (_options: unknown, handler: TestHandler) => (request: NextRequest) =>
      handler(request, mocks.authContext as Record<string, never>),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { oauth2Consent: mocks.oauth2Consent } }),
}));

vi.mock("@/lib/db", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-oauth-signing-secret",
    BETTER_AUTH_URL: "https://admin.example.com",
  }),
}));

vi.mock("@/lib/mcp/oauth", () => ({
  isCanonicalMcpResource: (value: string | null) =>
    value === "https://admin.example.com/mcp",
  isValidSignedOAuthQuery: mocks.isValidSignedOAuthQuery,
  MCP_OAUTH_SCOPE: "onfire:mcp",
}));

vi.mock("@/lib/mcp/grants", () => ({
  discardMcpAuthorizationCode: mocks.discardMcpAuthorizationCode,
  hashOAuthToken: mocks.hashOAuthToken,
  parseStringArray: vi.fn(() => []),
  saveMcpGrant: mocks.saveMcpGrant,
}));

import { GET, POST } from "./route";

const validClient = {
  clientId: "client-1",
  disabled: false,
  applicationType: "native",
  clientDiscoveryId: null,
  dpopBoundAccessTokens: false,
  grantTypes: ["authorization_code", "refresh_token"],
  redirectUris: ["http://127.0.0.1:9876/callback"],
  requirePKCE: true,
  responseTypes: ["code"],
  skipConsent: false,
  tokenEndpointAuthMethod: "none",
  name: "Desktop MCP client",
  uri: "https://client.example.com",
};

function authContext(client = validClient) {
  const selectRows = [[], []] as unknown[][];
  return {
    db: {
      query: {
        oauthClient: { findFirst: vi.fn().mockResolvedValue(client) },
        mcpOauthGrants: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockImplementation(() => selectRows.shift() ?? []),
          })),
        })),
      })),
    },
    user: { id: "user-1", tenantId: "tenant-1" },
    role: "super_admin",
    isSuperAdmin: true,
    tenantIds: [],
    teamIds: [],
    productIds: [],
    params: {},
  };
}

const baseConsent = {
  accept: false,
  oauthQuery:
    "client_id=client-1&redirect_uri=http%3A%2F%2F127.0.0.1%3A9876%2Fcallback&response_type=code&response_mode=query&scope=onfire%3Amcp+offline_access&resource=https%3A%2F%2Fadmin.example.com%2Fmcp&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256",
  permissions: [],
  resourceMode: "all",
  tenantIds: [],
  productIds: [],
} as const;

function consentRequest(): NextRequest {
  return new NextRequest(
    "https://admin.example.com/api/tob/oauth/authorize",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://admin.example.com",
      },
      body: "{}",
    },
  );
}

describe("MCP OAuth consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = authContext();
    mocks.discardMcpAuthorizationCode.mockResolvedValue(undefined);
    mocks.hashOAuthToken.mockResolvedValue("authorization-code-hash");
    mocks.isValidSignedOAuthQuery.mockResolvedValue(true);
    mocks.parseBody.mockResolvedValue(baseConsent);
    mocks.parseQuery.mockReturnValue({ oauth_query: baseConsent.oauthQuery });
    mocks.saveMcpGrant.mockResolvedValue(undefined);
  });

  it("returns the registered callback host from the signed Provider query", async () => {
    const response = await GET(
      new NextRequest(
        "https://admin.example.com/api/tob/oauth/authorize?oauth_query=signed",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        client: {
          id: "client-1",
          name: "Desktop MCP client",
          uri: "https://client.example.com",
        },
        callback: { host: "127.0.0.1:9876", isLoopback: true },
      },
    });
    expect(mocks.isValidSignedOAuthQuery).toHaveBeenCalledWith(
      baseConsent.oauthQuery,
    );
  });

  it("rejects a signed callback that is not registered to the client", async () => {
    const oauthQuery = new URLSearchParams(baseConsent.oauthQuery);
    oauthQuery.set("redirect_uri", "https://attacker.example/callback");
    mocks.parseQuery.mockReturnValue({ oauth_query: oauthQuery.toString() });

    await expect(
      GET(
        new NextRequest(
          "https://admin.example.com/api/tob/oauth/authorize?oauth_query=signed",
        ),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "The OAuth client or redirect URI is invalid",
    });
  });

  it("uses Better Auth's request-aware Response mode", async () => {
    const redirectUrl =
      "http://127.0.0.1:9876/callback?error=access_denied";
    mocks.oauth2Consent.mockResolvedValue(
      Response.json({ redirect: true, url: redirectUrl }),
    );
    const request = consentRequest();

    const response = await POST(request);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { redirectUrl },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");

    const options = mocks.oauth2Consent.mock.calls[0]?.[0] as {
      request: Request;
      headers: Headers;
      asResponse: boolean;
      body: { accept: boolean; oauth_query: string };
    };
    expect(options.request).toBe(request);
    expect(options.headers).toBe(request.headers);
    expect(options.asResponse).toBe(true);
    expect(options.body).toEqual({
      accept: false,
      oauth_query: baseConsent.oauthQuery,
    });
  });

  it("rejects a signed flow that did not request the MCP scope", async () => {
    const oauthQuery = new URLSearchParams(baseConsent.oauthQuery);
    oauthQuery.set("scope", "offline_access");
    mocks.parseBody.mockResolvedValue({
      ...baseConsent,
      oauthQuery: oauthQuery.toString(),
    });

    await expect(POST(consentRequest())).rejects.toMatchObject({ status: 400 });
    expect(mocks.oauth2Consent).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "unknown scope",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("scope", "onfire:mcp unknown"),
    },
    {
      name: "duplicate scope",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("scope", "onfire:mcp onfire:mcp"),
    },
    {
      name: "noncanonical resource",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("resource", "https://attacker.example/mcp"),
    },
    {
      name: "duplicate resource",
      mutate: (parameters: URLSearchParams) =>
        parameters.append("resource", "https://admin.example.com/mcp"),
    },
    {
      name: "unsupported response type",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("response_type", "token"),
    },
    {
      name: "fragment response mode",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("response_mode", "fragment"),
    },
    {
      name: "plain PKCE",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("code_challenge_method", "plain"),
    },
    {
      name: "unknown signed parameter",
      mutate: (parameters: URLSearchParams) =>
        parameters.set("audience", "https://attacker.example"),
    },
  ])("rejects a signed query with $name before client or provider use", async ({ mutate }) => {
    const oauthQuery = new URLSearchParams(baseConsent.oauthQuery);
    mutate(oauthQuery);
    const context = authContext();
    mocks.authContext = context;
    mocks.parseBody.mockResolvedValue({
      ...baseConsent,
      oauthQuery: oauthQuery.toString(),
    });

    await expect(POST(consentRequest())).rejects.toMatchObject({ status: 400 });
    expect(context.db.query.oauthClient.findFirst).not.toHaveBeenCalled();
    expect(mocks.oauth2Consent).not.toHaveBeenCalled();
  });

  it("applies the same signed-query structure checks when loading consent", async () => {
    const oauthQuery = new URLSearchParams(baseConsent.oauthQuery);
    oauthQuery.append("client_id", "client-2");
    const context = authContext();
    mocks.authContext = context;
    mocks.parseQuery.mockReturnValue({ oauth_query: oauthQuery.toString() });

    await expect(
      GET(
        new NextRequest(
          "https://admin.example.com/api/tob/oauth/authorize?oauth_query=signed",
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(context.db.query.oauthClient.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired signed consent query", async () => {
    mocks.isValidSignedOAuthQuery.mockResolvedValue(false);

    await expect(POST(consentRequest())).rejects.toMatchObject({
      status: 400,
      message: "The OAuth authorization request is invalid or expired",
    });
    expect(mocks.oauth2Consent).not.toHaveBeenCalled();
  });

  it("maps an expired Better Auth consent query to a client error", async () => {
    mocks.oauth2Consent.mockRejectedValue(
      new BetterAuthApiError("BAD_REQUEST", {
        error: "invalid_signature",
      }),
    );

    await expect(POST(consentRequest())).rejects.toMatchObject({
      status: 400,
      message: "The OAuth authorization request is invalid or expired",
    });
  });

  it("requires the canonical ToB origin on consent mutations", async () => {
    const request = new NextRequest(
      "https://admin.example.com/api/tob/oauth/authorize",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );

    await expect(POST(request)).rejects.toMatchObject({
      status: 403,
      message: "A canonical OAuth consent origin is required",
    });
    expect(mocks.oauth2Consent).not.toHaveBeenCalled();
  });

  it("discards a generated authorization code when grant persistence fails", async () => {
    const redirectUrl =
      "http://127.0.0.1:9876/callback?code=raw-code&state=state-1";
    mocks.parseBody.mockResolvedValue({
      ...baseConsent,
      accept: true,
      permissions: ["tickets:read"],
    });
    mocks.oauth2Consent.mockResolvedValue(
      Response.json({ redirect: true, url: redirectUrl }),
    );
    mocks.saveMcpGrant.mockRejectedValue(new Error("D1 unavailable"));
    const context = authContext();
    const db = context.db;
    mocks.authContext = context;

    await expect(POST(consentRequest())).rejects.toThrow("D1 unavailable");
    expect(mocks.discardMcpAuthorizationCode).toHaveBeenCalledWith(
      db,
      "authorization-code-hash",
    );
  });
});
