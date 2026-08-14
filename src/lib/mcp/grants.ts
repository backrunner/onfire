import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  mcpOauthAuthorizations,
  mcpOauthGrants,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  verification,
} from "@/drizzle/schema";
import {
  resolveAuthedContext,
  type AuthedContext,
} from "@/lib/api/handler";
import { hasAgentReassignmentTeam } from "@/lib/api/scope";
import { ApiError } from "@/lib/api/response";
import { getDb, type Database } from "@/lib/db";
import {
  effectiveMcpPermissions,
  isMcpPermission,
  type McpPermission,
} from "@/lib/mcp/permissions";
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPE,
  MCP_REFRESH_TOKEN_PREFIX,
  getMcpResourceMetadataUrl,
  isCanonicalMcpResource,
} from "@/lib/mcp/oauth";
import { isMcpPublicClientMetadata } from "@/lib/mcp/oauth-client";

export interface McpGrantContext extends AuthedContext {
  grant: typeof mcpOauthGrants.$inferSelect;
  oauthClient: typeof oauthClient.$inferSelect;
  mcpPermissions: McpPermission[];
}

interface SaveMcpGrantInput {
  userId: string;
  clientId: string;
  authorizationCodeId: string;
  permissions: McpPermission[];
  resourceMode: "all" | "selected";
  tenantIds: string[];
  productIds: string[];
}

export function parseStringArray(value: unknown): string[] {
  let current = value;
  for (let depth = 0; depth < 2 && typeof current === "string"; depth += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(current)
    ? current.filter((item): item is string => typeof item === "string")
    : [];
}

function parseStrictStringArray(value: unknown): string[] | null {
  let current = value;
  for (let depth = 0; depth < 2 && typeof current === "string"; depth += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }
  return Array.isArray(current) && current.every((item) => typeof item === "string")
    ? current
    : null;
}

export async function hashOAuthToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Destroy a provider code and any OnFire binding before it can be redeemed. */
export async function discardMcpAuthorizationCode(
  db: Database,
  authorizationCodeId: string,
): Promise<void> {
  await db.batch([
    db
      .delete(mcpOauthAuthorizations)
      .where(
        eq(
          mcpOauthAuthorizations.authorizationCodeId,
          authorizationCodeId,
        ),
      ),
    db
      .delete(verification)
      .where(eq(verification.identifier, authorizationCodeId)),
  ]);
}

export function isUsableMcpAccessToken(
  token: Pick<
    typeof oauthAccessToken.$inferSelect,
    "confirmation" | "expiresAt" | "resources" | "revoked" | "scopes"
  >,
  now = Date.now(),
): boolean {
  const resources = parseStrictStringArray(token.resources);
  const scopes = parseStrictStringArray(token.scopes);
  return (
    token.confirmation == null &&
    token.revoked === null &&
    token.expiresAt.getTime() > now &&
    scopes !== null &&
    scopes.length > 0 &&
    new Set(scopes).size === scopes.length &&
    scopes.includes(MCP_OAUTH_SCOPE) &&
    scopes.every(
      (scope) => scope === MCP_OAUTH_SCOPE || scope === "offline_access",
    ) &&
    resources !== null &&
    resources.length === 1 &&
    isCanonicalMcpResource(resources[0] ?? null)
  );
}

export function canUseMcpBearerToken(
  client: Pick<
    typeof oauthClient.$inferSelect,
    | "applicationType"
    | "clientSecret"
    | "clientDiscoveryId"
    | "disabled"
    | "dpopBoundAccessTokens"
    | "grantTypes"
    | "redirectUris"
    | "requirePKCE"
    | "responseTypes"
    | "skipConsent"
    | "tokenEndpointAuthMethod"
  > | null | undefined,
): boolean {
  return Boolean(client && !client.disabled && isMcpPublicClientMetadata(client));
}

export function isMcpGrantVersionBound(
  grant: Pick<typeof mcpOauthGrants.$inferSelect, "version">,
  authorization:
    | Pick<typeof mcpOauthAuthorizations.$inferSelect, "grantVersion">
    | null
    | undefined,
): boolean {
  return Boolean(
    grant.version &&
      grant.version !== "legacy" &&
      authorization &&
      authorization.grantVersion === grant.version,
  );
}

export function isUsableMcpGrant(
  grant: Pick<
    typeof mcpOauthGrants.$inferSelect,
    "permissions" | "productIds" | "resourceMode" | "tenantIds" | "version"
  >,
): boolean {
  if (
    !grant.version ||
    grant.version === "legacy" ||
    !parseStringArray(grant.permissions).some(isMcpPermission)
  ) {
    return false;
  }
  if (grant.resourceMode === "all") return true;
  return (
    grant.resourceMode === "selected" &&
    (parseStringArray(grant.tenantIds).length > 0 ||
      parseStringArray(grant.productIds).length > 0)
  );
}

async function currentMcpGrant(
  db: Database,
  userId: string,
  clientId: string,
): Promise<typeof mcpOauthGrants.$inferSelect | null> {
  const grant = await db.query.mcpOauthGrants.findFirst({
    where: and(
      eq(mcpOauthGrants.userId, userId),
      eq(mcpOauthGrants.clientId, clientId),
      isNull(mcpOauthGrants.revokedAt),
    ),
  });
  return grant && isUsableMcpGrant(grant) ? grant : null;
}

/** Bind a prompt=none code to the existing grant without changing authority. */
export async function bindCurrentMcpGrantAuthorization(
  db: Database,
  input: { authorizationCodeId: string; userId: string; clientId: string },
): Promise<boolean> {
  const grant = await currentMcpGrant(db, input.userId, input.clientId);
  if (!grant) return false;
  await db.insert(mcpOauthAuthorizations).values({
    ...input,
    grantVersion: grant.version,
    createdAt: new Date().toISOString(),
  });
  return true;
}

export async function isMcpAuthorizationCodeBound(
  db: Database,
  authorizationCodeId: string,
): Promise<boolean> {
  const authorization =
    await db.query.mcpOauthAuthorizations.findFirst({
      where: eq(
        mcpOauthAuthorizations.authorizationCodeId,
        authorizationCodeId,
      ),
    });
  if (!authorization) return false;
  const grant = await currentMcpGrant(
    db,
    authorization.userId,
    authorization.clientId,
  );
  return Boolean(grant && isMcpGrantVersionBound(grant, authorization));
}

export async function isMcpTokenRequestBound(
  db: Database,
  form: URLSearchParams,
): Promise<boolean> {
  const grantTypes = form.getAll("grant_type");
  const clientIds = form.getAll("client_id");
  if (
    grantTypes.length !== 1 ||
    clientIds.length !== 1 ||
    !clientIds[0]
  ) {
    return false;
  }

  let authorizationCodeId: string | null = null;
  let userId: string | null = null;
  const clientId = clientIds[0];
  if (grantTypes[0] === "authorization_code") {
    const codes = form.getAll("code");
    if (codes.length !== 1 || !codes[0]) return false;
    authorizationCodeId = await hashOAuthToken(codes[0]);
    const authorization =
      await db.query.mcpOauthAuthorizations.findFirst({
        where: and(
          eq(
            mcpOauthAuthorizations.authorizationCodeId,
            authorizationCodeId,
          ),
          eq(mcpOauthAuthorizations.clientId, clientId),
        ),
      });
    userId = authorization?.userId ?? null;
  } else if (grantTypes[0] === "refresh_token") {
    const refreshTokens = form.getAll("refresh_token");
    const presented = refreshTokens[0];
    if (
      refreshTokens.length !== 1 ||
      !presented?.startsWith(MCP_REFRESH_TOKEN_PREFIX)
    ) {
      return false;
    }
    const rawToken = presented.slice(MCP_REFRESH_TOKEN_PREFIX.length);
    if (!rawToken) return false;
    const refresh = await db.query.oauthRefreshToken.findFirst({
      where: eq(oauthRefreshToken.token, await hashOAuthToken(rawToken)),
    });
    if (
      !refresh ||
      refresh.clientId !== clientId ||
      !refresh.authorizationCodeId
    ) {
      return false;
    }
    authorizationCodeId = refresh.authorizationCodeId;
    userId = refresh.userId;
  } else {
    return false;
  }

  if (!authorizationCodeId || !userId) return false;

  const [authorization, grant] = await Promise.all([
    db.query.mcpOauthAuthorizations.findFirst({
      where: and(
        eq(
          mcpOauthAuthorizations.authorizationCodeId,
          authorizationCodeId,
        ),
        eq(mcpOauthAuthorizations.userId, userId),
        eq(mcpOauthAuthorizations.clientId, clientId),
      ),
    }),
    currentMcpGrant(db, userId, clientId),
  ]);
  return Boolean(grant && isMcpGrantVersionBound(grant, authorization));
}

/**
 * Keep public-client revocation scoped to the token's actual owner. The
 * provider invalidates replayed refresh families before its client-ID check,
 * so an ownership preflight prevents one client from invalidating another.
 */
export async function isMcpRevocationTokenOwnedByClient(
  db: Database,
  form: URLSearchParams,
): Promise<boolean> {
  const clientId = form.get("client_id");
  const presented = form.get("token")?.replace(/^Bearer\s+/i, "");
  if (!clientId || !presented) return false;

  if (presented.startsWith(MCP_ACCESS_TOKEN_PREFIX)) {
    const rawToken = presented.slice(MCP_ACCESS_TOKEN_PREFIX.length);
    if (!rawToken) return false;
    const token = await db.query.oauthAccessToken.findFirst({
      where: eq(oauthAccessToken.token, await hashOAuthToken(rawToken)),
      columns: { clientId: true },
    });
    return token?.clientId === clientId;
  }

  if (presented.startsWith(MCP_REFRESH_TOKEN_PREFIX)) {
    const rawToken = presented.slice(MCP_REFRESH_TOKEN_PREFIX.length);
    if (!rawToken) return false;
    const token = await db.query.oauthRefreshToken.findFirst({
      where: eq(oauthRefreshToken.token, await hashOAuthToken(rawToken)),
      columns: { clientId: true },
    });
    return token?.clientId === clientId;
  }

  return false;
}

/**
 * Replace a client's delegation without allowing its previously issued
 * tokens to inherit the new grant. Deleting refresh rows also prevents a
 * later retry of an old revoked token from invalidating the newly issued
 * token family.
 */
export async function saveMcpGrant(
  db: Database,
  input: SaveMcpGrantInput,
): Promise<void> {
  const now = new Date().toISOString();
  const version = crypto.randomUUID();
  await db.batch([
    db
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, input.userId),
          eq(oauthAccessToken.clientId, input.clientId),
        ),
      ),
    db
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, input.userId),
          eq(oauthRefreshToken.clientId, input.clientId),
        ),
      ),
    db
      .delete(mcpOauthAuthorizations)
      .where(
        and(
          eq(mcpOauthAuthorizations.userId, input.userId),
          eq(mcpOauthAuthorizations.clientId, input.clientId),
        ),
      ),
    db
      .insert(mcpOauthGrants)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        clientId: input.clientId,
        permissions: input.permissions,
        resourceMode: input.resourceMode,
        tenantIds: input.resourceMode === "selected" ? input.tenantIds : [],
        productIds: input.resourceMode === "selected" ? input.productIds : [],
        version,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [mcpOauthGrants.userId, mcpOauthGrants.clientId],
        set: {
          permissions: input.permissions,
          resourceMode: input.resourceMode,
          tenantIds: input.resourceMode === "selected" ? input.tenantIds : [],
          productIds:
            input.resourceMode === "selected" ? input.productIds : [],
          version,
          updatedAt: now,
          lastUsedAt: null,
          revokedAt: null,
        },
      }),
    db.insert(mcpOauthAuthorizations).values({
      authorizationCodeId: input.authorizationCodeId,
      userId: input.userId,
      clientId: input.clientId,
      grantVersion: version,
      createdAt: now,
    }),
  ]);
}

export async function revokeMcpGrant(
  db: Database,
  grant: typeof mcpOauthGrants.$inferSelect,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, grant.userId),
          eq(oauthAccessToken.clientId, grant.clientId),
        ),
      ),
    db
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, grant.userId),
          eq(oauthRefreshToken.clientId, grant.clientId),
        ),
      ),
    db
      .delete(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, grant.userId),
          eq(oauthConsent.clientId, grant.clientId),
        ),
      ),
    db
      .delete(mcpOauthAuthorizations)
      .where(
        and(
          eq(mcpOauthAuthorizations.userId, grant.userId),
          eq(mcpOauthAuthorizations.clientId, grant.clientId),
        ),
      ),
    db
      .update(mcpOauthGrants)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(mcpOauthGrants.id, grant.id)),
  ]);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 4096) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export async function authenticateMcpRequest(
  request: Request,
): Promise<McpGrantContext | null> {
  return authenticateMcpRequestWithDb(getDb(), request);
}

export async function authenticateMcpRequestWithDb(
  db: Database,
  request: Request,
): Promise<McpGrantContext | null> {
  const presented = bearerToken(request);
  if (!presented?.startsWith(MCP_ACCESS_TOKEN_PREFIX)) return null;

  const rawToken = presented.slice(MCP_ACCESS_TOKEN_PREFIX.length);
  if (!rawToken) return null;

  const token = await db.query.oauthAccessToken.findFirst({
    where: eq(oauthAccessToken.token, await hashOAuthToken(rawToken)),
  });
  if (
    !token?.userId ||
    !isUsableMcpAccessToken(token)
  ) {
    return null;
  }

  const [client, grant, authorization] = await Promise.all([
    db.query.oauthClient.findFirst({
      where: and(
        eq(oauthClient.clientId, token.clientId),
        eq(oauthClient.disabled, false),
      ),
    }),
    db.query.mcpOauthGrants.findFirst({
      where: and(
        eq(mcpOauthGrants.userId, token.userId),
        eq(mcpOauthGrants.clientId, token.clientId),
        isNull(mcpOauthGrants.revokedAt),
      ),
    }),
    token.authorizationCodeId
      ? db.query.mcpOauthAuthorizations.findFirst({
          where: and(
            eq(
              mcpOauthAuthorizations.authorizationCodeId,
              token.authorizationCodeId,
            ),
            eq(mcpOauthAuthorizations.userId, token.userId),
            eq(mcpOauthAuthorizations.clientId, token.clientId),
          ),
        })
      : null,
  ]);
  if (
    !client ||
    !canUseMcpBearerToken(client) ||
    !grant ||
    !isUsableMcpGrant(grant) ||
    !isMcpGrantVersionBound(grant, authorization) ||
    (grant.resourceMode !== "all" && grant.resourceMode !== "selected")
  ) {
    return null;
  }

  const baseContext = await resolveAuthedContext(db, token.userId, {});
  if (!baseContext) return null;

  const grantedPermissions = parseStringArray(grant.permissions);
  const agentReassignEnabled =
    grantedPermissions.includes("tickets:reassign") &&
    (await hasAgentReassignmentTeam(baseContext));
  const permissions = effectiveMcpPermissions(
    baseContext.role,
    grantedPermissions,
    { agentReassignEnabled },
  );
  if (permissions.length === 0) return null;

  const context: McpGrantContext = {
    ...baseContext,
    ...(grant.resourceMode === "selected"
      ? {
          delegatedResourceScope: {
            mode: "selected" as const,
            tenantIds: parseStringArray(grant.tenantIds),
            productIds: parseStringArray(grant.productIds),
          },
        }
      : {}),
    grant,
    oauthClient: client,
    mcpPermissions: permissions,
  };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  if (!grant.lastUsedAt || grant.lastUsedAt < staleBefore) {
    try {
      await db
        .update(mcpOauthGrants)
        .set({ lastUsedAt: now.toISOString() })
        .where(
          and(
            eq(mcpOauthGrants.id, grant.id),
            or(
              isNull(mcpOauthGrants.lastUsedAt),
              lt(mcpOauthGrants.lastUsedAt, staleBefore),
            ),
          ),
        );
    } catch (error) {
      // lastUsedAt is observability data, not an authorization input. A
      // transient bookkeeping failure must not turn a valid bearer request
      // into an unhandled 500 or force a client to reauthorize.
      console.error("Failed to update MCP grant last-used timestamp", error);
    }
  }

  return context;
}

export function hasMcpPermission(
  context: McpGrantContext,
  permission: McpPermission,
): boolean {
  return context.mcpPermissions.includes(permission);
}

export function requireMcpPermission(
  context: McpGrantContext,
  permission: McpPermission,
): void {
  if (!hasMcpPermission(context, permission)) {
    throw new ApiError(403, `MCP permission required: ${permission}`);
  }
}

export function mcpUnauthorizedResponse(invalidToken = false): Response {
  let metadataUrl: string;
  try {
    metadataUrl = getMcpResourceMetadataUrl();
  } catch (error) {
    console.error("MCP canonical URL configuration is invalid", error);
    return Response.json(
      {
        error: "temporarily_unavailable",
        error_description: "The MCP service is temporarily unavailable",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      },
    );
  }
  const challenge = [
    `Bearer resource_metadata="${metadataUrl}"`,
    `scope="${MCP_OAUTH_SCOPE}"`,
    ...(invalidToken ? ['error="invalid_token"'] : []),
  ].join(", ");
  return Response.json(
    {
      error: "unauthorized",
      error_description: invalidToken
        ? "The MCP access token is invalid or expired"
        : "An MCP access token is required",
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "WWW-Authenticate": challenge,
      },
    },
  );
}
