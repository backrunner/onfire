import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  mcpOauthAuthorizations,
  mcpOauthGrants,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session,
  user as authUser,
  users,
  verification,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import {
  authenticateMcpRequestWithDb,
  bindCurrentMcpGrantAuthorization,
  discardMcpAuthorizationCode,
  hashOAuthToken,
  isMcpAuthorizationCodeBound,
  isMcpRevocationTokenOwnedByClient,
  isMcpTokenRequestBound,
  revokeMcpGrant,
  saveMcpGrant,
} from "@/lib/mcp/grants";
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPE,
  MCP_REFRESH_TOKEN_PREFIX,
} from "@/lib/mcp/oauth";
import { Role } from "@/lib/types";
import { createTestDb, uid } from "./test-db";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getEnv: () => ({ BETTER_AUTH_URL: "https://admin.example.com" }),
  };
});

const MCP_RESOURCE = "https://admin.example.com/mcp";

interface SeededOAuthFamily {
  userId: string;
  clientId: string;
  sessionId: string;
  rawCode: string;
  authorizationCodeId: string;
  rawAccessToken: string;
  rawRefreshToken: string;
  accessTokenId: string;
  refreshTokenId: string;
}

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function seedOAuthFamily(): Promise<SeededOAuthFamily> {
  const userId = uid("mcp-user");
  const clientId = uid("mcp-client");
  const sessionId = uid("mcp-session");
  const rawCode = uid("mcp-code");
  const rawAccessToken = uid("mcp-access");
  const rawRefreshToken = uid("mcp-refresh");
  const accessTokenId = uid("mcp-access-row");
  const refreshTokenId = uid("mcp-refresh-row");
  const now = new Date();
  const authorizationCodeId = await hashOAuthToken(rawCode);

  await db.insert(authUser).values({
    id: userId,
    name: "MCP User",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    displayName: "MCP User",
    tenantId: uid("tenant"),
    role: Role.SuperAdmin,
  });
  await db.insert(session).values({
    id: sessionId,
    token: uid("session-token"),
    userId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(oauthClient).values({
    id: uid("oauth-client-row"),
    clientId,
    disabled: false,
    dpopBoundAccessTokens: false,
    redirectUris: ["http://127.0.0.1:9876/callback"],
    tokenEndpointAuthMethod: "none",
    applicationType: "native",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    createdAt: now,
    updatedAt: now,
  });

  await saveMcpGrant(db, {
    userId,
    clientId,
    authorizationCodeId,
    permissions: ["tickets:read"],
    resourceMode: "all",
    tenantIds: [],
    productIds: [],
  });

  await db.insert(oauthRefreshToken).values({
    id: refreshTokenId,
    token: await hashOAuthToken(rawRefreshToken),
    clientId,
    sessionId,
    userId,
    authorizationCodeId,
    resources: [MCP_RESOURCE],
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    createdAt: now,
    scopes: [MCP_OAUTH_SCOPE, "offline_access"],
  });
  await db.insert(oauthAccessToken).values({
    id: accessTokenId,
    token: await hashOAuthToken(rawAccessToken),
    clientId,
    sessionId,
    userId,
    authorizationCodeId,
    resources: [MCP_RESOURCE],
    refreshId: refreshTokenId,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    createdAt: now,
    scopes: [MCP_OAUTH_SCOPE],
  });

  return {
    userId,
    clientId,
    sessionId,
    rawCode,
    authorizationCodeId,
    rawAccessToken,
    rawRefreshToken,
    accessTokenId,
    refreshTokenId,
  };
}

function codeForm(family: SeededOAuthFamily, code = family.rawCode) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: family.clientId,
    code,
    resource: MCP_RESOURCE,
  });
}

function refreshForm(
  family: SeededOAuthFamily,
  refreshToken = family.rawRefreshToken,
) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: family.clientId,
    refresh_token: `${MCP_REFRESH_TOKEN_PREFIX}${refreshToken}`,
    resource: MCP_RESOURCE,
  });
}

function bearerRequest(rawAccessToken: string): Request {
  return new Request(MCP_RESOURCE, {
    headers: {
      Authorization: `Bearer ${MCP_ACCESS_TOKEN_PREFIX}${rawAccessToken}`,
    },
  });
}

describe("MCP OAuth persistence", () => {
  it("accepts only authorization codes bound to the current grant version", async () => {
    const family = await seedOAuthFamily();

    await expect(
      isMcpTokenRequestBound(db, codeForm(family)),
    ).resolves.toBe(true);
    await expect(
      isMcpAuthorizationCodeBound(db, family.authorizationCodeId),
    ).resolves.toBe(true);
    await expect(
      isMcpTokenRequestBound(db, codeForm(family, "unbound-code")),
    ).resolves.toBe(false);

    await db
      .update(mcpOauthGrants)
      .set({ version: uid("rotated-version") })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );

    await expect(
      isMcpTokenRequestBound(db, codeForm(family)),
    ).resolves.toBe(false);
    await expect(
      isMcpAuthorizationCodeBound(db, family.authorizationCodeId),
    ).resolves.toBe(false);
  });

  it("accepts refresh tokens only from the current authorization family", async () => {
    const family = await seedOAuthFamily();

    await expect(
      isMcpTokenRequestBound(db, refreshForm(family)),
    ).resolves.toBe(true);
    await expect(
      isMcpTokenRequestBound(db, refreshForm(family, "unknown-refresh")),
    ).resolves.toBe(false);

    await db
      .update(oauthRefreshToken)
      .set({ revoked: new Date() })
      .where(eq(oauthRefreshToken.id, family.refreshTokenId));
    await expect(
      isMcpTokenRequestBound(db, refreshForm(family)),
    ).resolves.toBe(true);

    await db
      .update(mcpOauthAuthorizations)
      .set({ grantVersion: uid("stale-version") })
      .where(
        eq(
          mcpOauthAuthorizations.authorizationCodeId,
          family.authorizationCodeId,
        ),
      );

    await expect(
      isMcpTokenRequestBound(db, refreshForm(family)),
    ).resolves.toBe(false);
  });

  it("preflights revocation against the token's actual public client", async () => {
    const family = await seedOAuthFamily();
    const ownRefresh = new URLSearchParams({
      client_id: family.clientId,
      token: `${MCP_REFRESH_TOKEN_PREFIX}${family.rawRefreshToken}`,
    });
    await expect(
      isMcpRevocationTokenOwnedByClient(db, ownRefresh),
    ).resolves.toBe(true);

    await db
      .update(oauthRefreshToken)
      .set({ revoked: new Date() })
      .where(eq(oauthRefreshToken.id, family.refreshTokenId));
    await expect(
      isMcpRevocationTokenOwnedByClient(db, ownRefresh),
    ).resolves.toBe(true);

    const otherClientId = uid("other-client");
    await db.insert(oauthClient).values({
      id: uid("other-client-row"),
      clientId: otherClientId,
      disabled: false,
      redirectUris: ["http://127.0.0.1:8765/callback"],
      tokenEndpointAuthMethod: "none",
      applicationType: "native",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      requirePKCE: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const wrongClient = new URLSearchParams(ownRefresh);
    wrongClient.set("client_id", otherClientId);
    await expect(
      isMcpRevocationTokenOwnedByClient(db, wrongClient),
    ).resolves.toBe(false);

    const unknown = new URLSearchParams(ownRefresh);
    unknown.set("token", `${MCP_REFRESH_TOKEN_PREFIX}${uid("unknown")}`);
    await expect(
      isMcpRevocationTokenOwnedByClient(db, unknown),
    ).resolves.toBe(false);
  });

  it("fails closed when a stored grant contains only unknown permissions", async () => {
    const family = await seedOAuthFamily();
    await db
      .update(mcpOauthGrants)
      .set({ permissions: ["future:unknown"] })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );

    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toBeNull();
    await expect(
      bindCurrentMcpGrantAuthorization(db, {
        authorizationCodeId: await hashOAuthToken(uid("unknown-permission-code")),
        userId: family.userId,
        clientId: family.clientId,
      }),
    ).resolves.toBe(false);
  });

  it("keeps known permissions from mixed-version grants", async () => {
    const family = await seedOAuthFamily();
    await db
      .update(mcpOauthGrants)
      .set({ permissions: ["future:unknown", "tickets:read"] })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );

    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toMatchObject({ mcpPermissions: ["tickets:read"] });
  });

  it("does not accept a sender-constrained access token as Bearer", async () => {
    const family = await seedOAuthFamily();
    await db
      .update(oauthAccessToken)
      .set({ confirmation: { jkt: "A".repeat(43) } })
      .where(eq(oauthAccessToken.id, family.accessTokenId));

    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toBeNull();
  });

  it("rejects a bearer when live RBAC removes every granted permission", async () => {
    const family = await seedOAuthFamily();
    await db
      .update(mcpOauthGrants)
      .set({ permissions: ["settings:read"] })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );
    await db
      .update(users)
      .set({ role: Role.Agent })
      .where(eq(users.id, family.userId));

    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toBeNull();
  });

  it("keeps an offline access token valid after the browser session is deleted", async () => {
    const family = await seedOAuthFamily();

    const beforeLogout = await authenticateMcpRequestWithDb(
      db,
      bearerRequest(family.rawAccessToken),
    );
    expect(beforeLogout?.user.id).toBe(family.userId);
    expect(beforeLogout?.mcpPermissions).toEqual(["tickets:read"]);

    await db.delete(session).where(eq(session.id, family.sessionId));

    const persistedAccessToken = await db.query.oauthAccessToken.findFirst({
      where: eq(oauthAccessToken.id, family.accessTokenId),
    });
    expect(persistedAccessToken?.sessionId).toBeNull();
    await expect(
      isMcpTokenRequestBound(db, refreshForm(family)),
    ).resolves.toBe(true);
    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toMatchObject({
      user: { id: family.userId },
      mcpPermissions: ["tickets:read"],
    });
  });

  it("atomically replaces the grant and invalidates the old token family", async () => {
    const family = await seedOAuthFamily();
    const replacementRawCode = uid("replacement-code");
    const replacementCodeId = await hashOAuthToken(replacementRawCode);

    await saveMcpGrant(db, {
      userId: family.userId,
      clientId: family.clientId,
      authorizationCodeId: replacementCodeId,
      permissions: ["settings:read"],
      resourceMode: "selected",
      tenantIds: ["tenant-selected"],
      productIds: [],
    });

    await expect(
      db.query.oauthAccessToken.findFirst({
        where: eq(oauthAccessToken.id, family.accessTokenId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.oauthRefreshToken.findFirst({
        where: eq(oauthRefreshToken.id, family.refreshTokenId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      isMcpTokenRequestBound(db, codeForm(family)),
    ).resolves.toBe(false);

    const replacementGrant = await db.query.mcpOauthGrants.findFirst({
      where: and(
        eq(mcpOauthGrants.userId, family.userId),
        eq(mcpOauthGrants.clientId, family.clientId),
      ),
    });
    const replacementBinding =
      await db.query.mcpOauthAuthorizations.findFirst({
        where: eq(
          mcpOauthAuthorizations.authorizationCodeId,
          replacementCodeId,
        ),
      });
    expect(replacementGrant).toMatchObject({
      permissions: ["settings:read"],
      resourceMode: "selected",
      tenantIds: ["tenant-selected"],
      productIds: [],
      revokedAt: null,
    });
    expect(replacementBinding?.grantVersion).toBe(replacementGrant?.version);
    await expect(
      isMcpTokenRequestBound(
        db,
        codeForm(family, replacementRawCode),
      ),
    ).resolves.toBe(true);
  });

  it("revokes access, refresh, protocol consent, and authorization bindings together", async () => {
    const family = await seedOAuthFamily();
    const now = new Date();
    await db.insert(oauthConsent).values({
      id: uid("oauth-consent"),
      clientId: family.clientId,
      userId: family.userId,
      resources: [MCP_RESOURCE],
      scopes: [MCP_OAUTH_SCOPE, "offline_access"],
      createdAt: now,
      updatedAt: now,
    });
    const grant = await db.query.mcpOauthGrants.findFirst({
      where: and(
        eq(mcpOauthGrants.userId, family.userId),
        eq(mcpOauthGrants.clientId, family.clientId),
      ),
    });
    expect(grant).toBeDefined();

    await revokeMcpGrant(db, grant!);

    await expect(
      db.query.oauthAccessToken.findFirst({
        where: eq(oauthAccessToken.userId, family.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.oauthRefreshToken.findFirst({
        where: eq(oauthRefreshToken.userId, family.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.oauthConsent.findFirst({
        where: eq(oauthConsent.userId, family.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.mcpOauthAuthorizations.findFirst({
        where: eq(mcpOauthAuthorizations.userId, family.userId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      authenticateMcpRequestWithDb(
        db,
        bearerRequest(family.rawAccessToken),
      ),
    ).resolves.toBeNull();

    const revokedGrant = await db.query.mcpOauthGrants.findFirst({
      where: eq(mcpOauthGrants.id, grant!.id),
    });
    expect(revokedGrant?.revokedAt).toEqual(expect.any(String));
  });

  it("binds prompt=none only when an active grant exists", async () => {
    const family = await seedOAuthFamily();
    const silentCodeId = await hashOAuthToken(uid("silent-code"));

    await expect(
      bindCurrentMcpGrantAuthorization(db, {
        authorizationCodeId: silentCodeId,
        userId: family.userId,
        clientId: family.clientId,
      }),
    ).resolves.toBe(true);
    await expect(
      isMcpAuthorizationCodeBound(db, silentCodeId),
    ).resolves.toBe(true);

    await db
      .update(mcpOauthGrants)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );
    await expect(
      bindCurrentMcpGrantAuthorization(db, {
        authorizationCodeId: await hashOAuthToken(uid("revoked-code")),
        userId: family.userId,
        clientId: family.clientId,
      }),
    ).resolves.toBe(false);
  });

  it("does not reactivate a legacy grant through prompt=none", async () => {
    const family = await seedOAuthFamily();
    await db
      .update(mcpOauthGrants)
      .set({ version: "legacy" })
      .where(
        and(
          eq(mcpOauthGrants.userId, family.userId),
          eq(mcpOauthGrants.clientId, family.clientId),
        ),
      );

    const authorizationCodeId = await hashOAuthToken(uid("legacy-silent-code"));
    await expect(
      bindCurrentMcpGrantAuthorization(db, {
        authorizationCodeId,
        userId: family.userId,
        clientId: family.clientId,
      }),
    ).resolves.toBe(false);
    await expect(
      isMcpAuthorizationCodeBound(db, authorizationCodeId),
    ).resolves.toBe(false);
  });

  it("discards both the provider verification and the OnFire binding", async () => {
    const family = await seedOAuthFamily();
    await db.insert(verification).values({
      id: uid("verification"),
      identifier: family.authorizationCodeId,
      value: JSON.stringify({
        type: "authorization_code",
        userId: family.userId,
      }),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await discardMcpAuthorizationCode(db, family.authorizationCodeId);

    await expect(
      db.query.verification.findFirst({
        where: eq(verification.identifier, family.authorizationCodeId),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.mcpOauthAuthorizations.findFirst({
        where: eq(
          mcpOauthAuthorizations.authorizationCodeId,
          family.authorizationCodeId,
        ),
      }),
    ).resolves.toBeUndefined();
  });
});
