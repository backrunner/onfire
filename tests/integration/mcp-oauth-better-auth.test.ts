import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oauthProvider } from "@better-auth/oauth-provider";
import * as schema from "@/drizzle/schema";
import {
  authenticateMcpRequestWithDb,
  hashOAuthToken,
  saveMcpGrant,
} from "@/lib/mcp/grants";
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPE,
  MCP_REFRESH_TOKEN_PREFIX,
} from "@/lib/mcp/oauth";
import { wrapMcpOAuthAdapter } from "@/lib/auth/mcp-adapter";
import { normalizeMcpRevocationResponse } from "@/lib/mcp/revocation";
import { Role } from "@/lib/types";
import {
  mcpOauthAuthorizations,
  oauthAccessToken,
  oauthClientResource,
  oauthRefreshToken,
  session,
  users,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { createTestDb, uid } from "./test-db";

const BASE_URL = "https://admin.example.com";
const AUTH_SECRET = "a-realistic-test-secret-that-is-long-enough-for-better-auth";
const MCP_RESOURCE = `${BASE_URL}/mcp`;

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getEnv: () => ({
      AUTH_SECRET,
      BETTER_AUTH_URL: BASE_URL,
    }),
  };
});

interface OAuthFixture {
  auth: ReturnType<typeof createFixture>;
  db: Database;
  userId: string;
  clientId: string;
  cookie: string;
  verifier: string;
  redirectUri: string;
}

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: BASE_URL,
  });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE_URL}/api/tob/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function formRequest(path: string, body: URLSearchParams, cookie?: string): Request {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    origin: BASE_URL,
  });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE_URL}/api/tob/auth${path}`, {
    method: "POST",
    headers,
    body: body.toString(),
  });
}

function cookieFromResponse(response: Response, cookieName: string): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie
    .split(/,(?=\s*[^;,=]+=[^;,]*)/)
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.split(";", 1)[0];
  if (!match) throw new Error("Better Auth did not set a session cookie");
  return match;
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createFixture(db: Database) {
  return betterAuth({
    database: (options: BetterAuthOptions) =>
      wrapMcpOAuthAdapter(
        drizzleAdapter(db, {
          provider: "sqlite",
          schema: {
            user: schema.user,
            session: schema.session,
            account: schema.account,
            verification: schema.verification,
            oauthClient: schema.oauthClient,
            oauthResource: schema.oauthResource,
            oauthClientResource: schema.oauthClientResource,
            oauthRefreshToken: schema.oauthRefreshToken,
            oauthAccessToken: schema.oauthAccessToken,
            oauthConsent: schema.oauthConsent,
            oauthClientAssertion: schema.oauthClientAssertion,
          },
        })(options),
      ),
    secret: AUTH_SECRET,
    baseURL: BASE_URL,
    basePath: "/api/tob/auth",
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },
    plugins: [
      oauthProvider({
        loginPage: "/admin/login",
        consentPage: "/admin/oauth/authorize",
        scopes: [MCP_OAUTH_SCOPE, "offline_access"],
        resources: [
          {
            identifier: MCP_RESOURCE,
            name: "OnFire MCP",
            allowedScopes: [MCP_OAUTH_SCOPE, "offline_access"],
          },
        ],
        enforcePerClientResources: true,
        grantTypes: ["authorization_code", "refresh_token"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultResources: [MCP_RESOURCE],
        clientRegistrationAllowedResources: [MCP_RESOURCE],
        clientRegistrationDefaultScopes: [MCP_OAUTH_SCOPE],
        clientRegistrationAllowedScopes: [MCP_OAUTH_SCOPE, "offline_access"],
        disableJwtPlugin: true,
        storeTokens: "hashed",
        refreshTokenReuseInterval: 0,
        prefix: {
          opaqueAccessToken: MCP_ACCESS_TOKEN_PREFIX,
          refreshToken: MCP_REFRESH_TOKEN_PREFIX,
        },
        clientPrivileges: () => false,
      }),
    ],
  });
}

async function prepareFixture(db: Database): Promise<OAuthFixture> {
  const auth = createFixture(db);
  const email = `${uid("oauth-user")}@example.com`;
  const password = "correct-horse-battery-staple";

  const signUp = await auth.handler(
    jsonRequest("/sign-up/email", { email, password, name: "OAuth User" }),
  );
  expect(signUp.status).toBe(200);
  const signUpBody = (await signUp.json()) as { user?: { id?: string } };
  const userId = signUpBody.user?.id;
  expect(userId).toEqual(expect.any(String));

  await db.insert(users).values({
    id: userId!,
    email,
    displayName: "OAuth User",
    tenantId: uid("oauth-tenant"),
    role: Role.SuperAdmin,
  });

  const signIn = await auth.handler(
    jsonRequest("/sign-in/email", { email, password }),
  );
  expect(signIn.status).toBe(200);
  const authContext = await auth.$context;
  const cookieName = authContext.authCookies.sessionToken.name;
  const cookie = cookieFromResponse(signIn, cookieName);

  const redirectUri = "http://127.0.0.1:9876/callback";
  const registration = await auth.handler(
    jsonRequest("/oauth2/register", {
      redirect_uris: [redirectUri],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      application_type: "native",
      require_pkce: true,
      scope: `${MCP_OAUTH_SCOPE} offline_access`,
      resources: [MCP_RESOURCE],
    }),
  );
  expect(registration.status).toBe(201);
  const registrationBody = (await registration.json()) as {
    client_id?: string;
  };
  const clientId = registrationBody.client_id;
  expect(clientId).toEqual(expect.any(String));

  const link = await db.query.oauthClientResource.findFirst({
    where: eq(oauthClientResource.clientId, clientId!),
  });
  expect(link?.resourceId).toBe(MCP_RESOURCE);

  const verifier = `${uid("pkce-verifier")}${uid("pkce-verifier")}`;
  return {
    auth,
    db,
    userId: userId!,
    clientId: clientId!,
    cookie,
    verifier,
    redirectUri,
  };
}

interface ExchangedTokens {
  access_token: string;
  refresh_token?: string;
  codeId: string;
}

interface OfflineExchangedTokens extends ExchangedTokens {
  refresh_token: string;
}

async function authorizeAndExchange(
  fixture: OAuthFixture,
): Promise<OfflineExchangedTokens>;
async function authorizeAndExchange(
  fixture: OAuthFixture,
  includeOfflineAccess: false,
): Promise<ExchangedTokens>;
async function authorizeAndExchange(
  fixture: OAuthFixture,
  includeOfflineAccess = true,
): Promise<ExchangedTokens> {
  const challenge = await codeChallenge(fixture.verifier);
  const query = new URLSearchParams({
    client_id: fixture.clientId,
    redirect_uri: fixture.redirectUri,
    response_type: "code",
    scope: includeOfflineAccess
      ? `${MCP_OAUTH_SCOPE} offline_access`
      : MCP_OAUTH_SCOPE,
    resource: MCP_RESOURCE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "state-1",
  });
  const authorization = await fixture.auth.handler(
    new Request(`${BASE_URL}/api/tob/auth/oauth2/authorize?${query}`, {
      headers: { cookie: fixture.cookie },
    }),
  );
  expect(authorization.status).toBe(302);
  const consentLocation = authorization.headers.get("location");
  expect(consentLocation).toContain("/admin/oauth/authorize");

  const consentQuery = new URL(consentLocation!, BASE_URL).searchParams.toString();
  const consent = await fixture.auth.handler(
    jsonRequest(
      "/oauth2/consent",
      { accept: true, oauth_query: consentQuery },
      fixture.cookie,
    ),
  );
  expect(consent.status).toBe(200);
  const consentBody = (await consent.json()) as { redirect?: boolean; url?: string };
  expect(consentBody.redirect).toBe(true);
  const code = new URL(consentBody.url!).searchParams.get("code");
  expect(code).toEqual(expect.any(String));

  const codeId = await hashOAuthToken(code!);
  await saveMcpGrant(fixture.db, {
    userId: fixture.userId,
    clientId: fixture.clientId,
    authorizationCodeId: codeId,
    permissions: ["tickets:read"],
    resourceMode: "all",
    tenantIds: [],
    productIds: [],
  });

  const tokenResponse = await fixture.auth.handler(
    formRequest(
      "/oauth2/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: fixture.clientId,
        code: code!,
        code_verifier: fixture.verifier,
        redirect_uri: fixture.redirectUri,
        resource: MCP_RESOURCE,
      }),
    ),
  );
  expect(tokenResponse.status).toBe(200);
  const tokenBody = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
  };
  if (includeOfflineAccess) {
    expect(tokenBody.refresh_token).toEqual(expect.any(String));
  }
  return { ...tokenBody, codeId };
}

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("MCP OAuth with the real Better Auth provider", () => {
  it("does not issue a refresh token without offline_access", async () => {
    const fixture = await prepareFixture(db);
    const tokens = await authorizeAndExchange(fixture, false);

    expect(tokens.access_token).toMatch(/^onfire_at_/);
    expect(tokens).not.toHaveProperty("refresh_token");
    await expect(
      db.query.oauthRefreshToken.findMany({
        where: and(
          eq(oauthRefreshToken.clientId, fixture.clientId),
          eq(oauthRefreshToken.userId, fixture.userId),
        ),
      }),
    ).resolves.toEqual([]);
  });

  it("keeps delegated tokens independent from browser logout and rotates refresh tokens", async () => {
    const fixture = await prepareFixture(db);
    const tokens = await authorizeAndExchange(fixture);

    const accessRaw = tokens.access_token.slice(MCP_ACCESS_TOKEN_PREFIX.length);
    const refreshRaw = tokens.refresh_token.slice(MCP_REFRESH_TOKEN_PREFIX.length);
    const accessRow = await db.query.oauthAccessToken.findFirst({
      where: eq(oauthAccessToken.token, await hashOAuthToken(accessRaw)),
    });
    const refreshRow = await db.query.oauthRefreshToken.findFirst({
      where: eq(oauthRefreshToken.token, await hashOAuthToken(refreshRaw)),
    });
    expect(accessRow?.sessionId).toBeNull();
    expect(refreshRow?.sessionId).toBeNull();
    expect(accessRow?.authorizationCodeId).toBe(tokens.codeId);
    expect(refreshRow?.authorizationCodeId).toBe(tokens.codeId);

    const sessionRow = await db.query.session.findFirst({
      where: eq(session.userId, fixture.userId),
    });
    expect(sessionRow).toBeDefined();

    const signOut = await fixture.auth.handler(
      jsonRequest("/sign-out", {}, fixture.cookie),
    );
    expect(signOut.status).toBe(200);
    await expect(
      db.query.session.findFirst({ where: eq(session.userId, fixture.userId) }),
    ).resolves.toBeUndefined();

    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: {
            authorization: `Bearer ${tokens.access_token}`,
          },
        }),
      ),
    ).resolves.toMatchObject({
      user: { id: fixture.userId },
      mcpPermissions: ["tickets:read"],
    });

    const rotated = await fixture.auth.handler(
      formRequest(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fixture.clientId,
          refresh_token: tokens.refresh_token,
          resource: MCP_RESOURCE,
        }),
      ),
    );
    expect(rotated.status).toBe(200);
    const rotatedBody = (await rotated.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(rotatedBody.access_token).not.toBe(tokens.access_token);
    expect(rotatedBody.refresh_token).not.toBe(tokens.refresh_token);

    const oldRefresh = await db.query.oauthRefreshToken.findFirst({
      where: eq(oauthRefreshToken.id, refreshRow!.id),
    });
    expect(oldRefresh?.revoked).toEqual(expect.any(Date));

    const rotatedAccess = await db.query.oauthAccessToken.findFirst({
      where: eq(
        oauthAccessToken.token,
        await hashOAuthToken(
          rotatedBody.access_token.slice(MCP_ACCESS_TOKEN_PREFIX.length),
        ),
      ),
    });
    const rotatedRefresh = await db.query.oauthRefreshToken.findFirst({
      where: eq(
        oauthRefreshToken.token,
        await hashOAuthToken(
          rotatedBody.refresh_token.slice(MCP_REFRESH_TOKEN_PREFIX.length),
        ),
      ),
    });
    expect(rotatedAccess?.sessionId).toBeNull();
    expect(rotatedRefresh?.sessionId).toBeNull();
    expect(rotatedRefresh?.authorizationCodeId).toBe(tokens.codeId);

    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: {
            authorization: `Bearer ${rotatedBody.access_token}`,
          },
        }),
      ),
    ).resolves.toMatchObject({ user: { id: fixture.userId } });

    const binding = await db.query.mcpOauthAuthorizations.findFirst({
      where: and(
        eq(mcpOauthAuthorizations.authorizationCodeId, tokens.codeId),
        eq(mcpOauthAuthorizations.clientId, fixture.clientId),
      ),
    });
    expect(binding?.grantVersion).toEqual(expect.any(String));
  });

  it("revokes access and refresh tokens and silently accepts unknown tokens", async () => {
    const fixture = await prepareFixture(db);
    const tokens = await authorizeAndExchange(fixture);

    const accessRevoke = await fixture.auth.handler(
      formRequest(
        "/oauth2/revoke",
        new URLSearchParams({
          client_id: fixture.clientId,
          token: tokens.access_token,
          token_type_hint: "access_token",
        }),
      ),
    );
    expect(accessRevoke.status).toBe(200);
    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        }),
      ),
    ).resolves.toBeNull();

    const refreshed = await fixture.auth.handler(
      formRequest(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fixture.clientId,
          refresh_token: tokens.refresh_token,
          resource: MCP_RESOURCE,
        }),
      ),
    );
    expect(refreshed.status).toBe(200);
    const refreshedBody = (await refreshed.json()) as {
      access_token: string;
      refresh_token: string;
    };

    const refreshRevoke = await fixture.auth.handler(
      formRequest(
        "/oauth2/revoke",
        new URLSearchParams({
          client_id: fixture.clientId,
          token: refreshedBody.refresh_token,
          token_type_hint: "refresh_token",
        }),
      ),
    );
    expect(refreshRevoke.status).toBe(200);
    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: {
            authorization: `Bearer ${refreshedBody.access_token}`,
          },
        }),
      ),
    ).resolves.toBeNull();

    const unknownRevoke = await normalizeMcpRevocationResponse(
      await fixture.auth.handler(
        formRequest(
          "/oauth2/revoke",
          new URLSearchParams({
            client_id: fixture.clientId,
            token: `${MCP_ACCESS_TOKEN_PREFIX}${uid("unknown-token")}`,
          }),
        ),
      ),
    );
    expect(unknownRevoke.status).toBe(200);
  });

  it("invalidates the whole refresh family when a rotated token is replayed", async () => {
    const fixture = await prepareFixture(db);
    const tokens = await authorizeAndExchange(fixture);

    const rotate = await fixture.auth.handler(
      formRequest(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fixture.clientId,
          refresh_token: tokens.refresh_token,
          resource: MCP_RESOURCE,
        }),
      ),
    );
    expect(rotate.status).toBe(200);
    const rotated = (await rotate.json()) as {
      access_token: string;
      refresh_token: string;
    };
    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: { authorization: `Bearer ${rotated.access_token}` },
        }),
      ),
    ).resolves.toMatchObject({ user: { id: fixture.userId } });

    const replay = await fixture.auth.handler(
      formRequest(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fixture.clientId,
          refresh_token: tokens.refresh_token,
          resource: MCP_RESOURCE,
        }),
      ),
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({
      error: "invalid_grant",
    });

    const [refreshRows, accessRows] = await Promise.all([
      db.query.oauthRefreshToken.findMany({
        where: and(
          eq(oauthRefreshToken.clientId, fixture.clientId),
          eq(oauthRefreshToken.userId, fixture.userId),
        ),
      }),
      db.query.oauthAccessToken.findMany({
        where: and(
          eq(oauthAccessToken.clientId, fixture.clientId),
          eq(oauthAccessToken.userId, fixture.userId),
        ),
      }),
    ]);
    expect(refreshRows).toEqual([]);
    expect(accessRows).toEqual([]);
    await expect(
      authenticateMcpRequestWithDb(
        db,
        new Request(MCP_RESOURCE, {
          headers: { authorization: `Bearer ${rotated.access_token}` },
        }),
      ),
    ).resolves.toBeNull();

    const rotatedRefresh = await fixture.auth.handler(
      formRequest(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fixture.clientId,
          refresh_token: rotated.refresh_token,
          resource: MCP_RESOURCE,
        }),
      ),
    );
    expect(rotatedRefresh.status).toBe(400);
    await expect(rotatedRefresh.json()).resolves.toMatchObject({
      error: "invalid_grant",
    });
  });
});
