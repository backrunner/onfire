import { and, eq, inArray, isNull } from "drizzle-orm";
import { APIError as BetterAuthApiError } from "better-auth";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  mcpOauthGrants,
  oauthClient,
  products,
  tenants,
} from "@/drizzle/schema";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { badRequest, forbidden, notFound, ok } from "@/lib/api/response";
import {
  hasAgentReassignmentTeam,
  productScopeCondition,
} from "@/lib/api/scope";
import { getAuth } from "@/lib/auth";
import { assertCanonicalTobOrigin } from "@/lib/auth/origin";
import { withNoStoreHandler } from "@/lib/http-cache";
import {
  discardMcpAuthorizationCode,
  hashOAuthToken,
  isUsableMcpGrant,
  parseStringArray,
  saveMcpGrant,
} from "@/lib/mcp/grants";
import {
  availableMcpPermissions,
  effectiveMcpPermissions,
  MCP_PERMISSION_IDS,
} from "@/lib/mcp/permissions";
import {
  isCanonicalMcpResource,
  isValidSignedOAuthQuery,
  MCP_OAUTH_SCOPE,
} from "@/lib/mcp/oauth";
import {
  isMcpLoopbackHostname,
  isMcpPublicClientMetadata,
  matchesRegisteredMcpRedirectUri,
  parseMcpRedirectUri,
} from "@/lib/mcp/oauth-client";

const oauthQuerySchema = z.object({
  oauth_query: z.string().min(1).max(16_384),
});

const consentSchema = z.object({
  accept: z.boolean(),
  oauthQuery: z.string().min(1).max(16_384),
  permissions: z.array(z.enum(MCP_PERMISSION_IDS)).max(MCP_PERMISSION_IDS.length),
  resourceMode: z.enum(["all", "selected"]),
  tenantIds: z.array(z.string().min(1)).max(100),
  productIds: z.array(z.string().min(1)).max(500),
});

const oauthConsentResultSchema = z.object({
  redirect: z.literal(true),
  url: z.string().min(1),
});

const oauthConsentErrorSchema = z.object({
  error_description: z.string().optional(),
  message: z.string().optional(),
});

const S256_CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SUPPORTED_OAUTH_SCOPES = new Set([MCP_OAUTH_SCOPE, "offline_access"]);
const OAUTH_PROMPT_VALUES = new Set([
  "none",
  "consent",
  "login",
  "create",
  "select_account",
]);
const SIGNED_AUTHORIZATION_PARAMETERS = new Set([
  "client_id",
  "code_challenge",
  "code_challenge_method",
  "prompt",
  "redirect_uri",
  "resource",
  "response_mode",
  "response_type",
  "scope",
  "state",
  "exp",
  "sig",
  "ba_iat",
  "ba_param",
  "ba_pl",
]);
const SINGLE_VALUE_SIGNED_PARAMETERS = [
  ...SIGNED_AUTHORIZATION_PARAMETERS,
].filter((name) => name !== "ba_param");

function oauthParameters(oauthQuery: string): URLSearchParams {
  return new URLSearchParams(oauthQuery);
}

function assertMcpAuthorizationParameters(parameters: URLSearchParams): {
  clientId: string;
  requestedScopes: string[];
} {
  const invalid = (): never => {
    throw badRequest("The OAuth authorization request is invalid");
  };
  for (const name of parameters.keys()) {
    if (!SIGNED_AUTHORIZATION_PARAMETERS.has(name)) invalid();
  }
  if (
    SINGLE_VALUE_SIGNED_PARAMETERS.some(
      (name) => parameters.getAll(name).length > 1,
    )
  ) {
    invalid();
  }
  const signedParameterNames = parameters.getAll("ba_param");
  if (
    new Set(signedParameterNames).size !== signedParameterNames.length ||
    signedParameterNames.some(
      (name) => !SIGNED_AUTHORIZATION_PARAMETERS.has(name),
    )
  ) {
    invalid();
  }

  const clientId = parameters.get("client_id");
  const redirectUri = parameters.get("redirect_uri");
  if (!clientId || !redirectUri) {
    throw badRequest("The OAuth authorization request is invalid");
  }
  if (
    clientId.length > 200 ||
    redirectUri.length > 2048 ||
    !parseMcpRedirectUri(redirectUri) ||
    parameters.get("response_type") !== "code" ||
    (parameters.get("response_mode") !== null &&
      parameters.get("response_mode") !== "query") ||
    !isCanonicalMcpResource(parameters.get("resource")) ||
    !S256_CODE_CHALLENGE_PATTERN.test(
      parameters.get("code_challenge") ?? "",
    ) ||
    parameters.get("code_challenge_method") !== "S256"
  ) {
    invalid();
  }

  const requestedScopes = (parameters.get("scope") ?? "").split(" ");
  if (
    requestedScopes.length === 0 ||
    requestedScopes.some(
      (scope) => !scope || !SUPPORTED_OAUTH_SCOPES.has(scope),
    ) ||
    new Set(requestedScopes).size !== requestedScopes.length ||
    !requestedScopes.includes(MCP_OAUTH_SCOPE)
  ) {
    invalid();
  }

  const prompt = parameters.get("prompt");
  if (prompt !== null) {
    const values = prompt.split(" ");
    if (
      values.some((value) => !value || !OAUTH_PROMPT_VALUES.has(value)) ||
      new Set(values).size !== values.length ||
      (values.includes("none") && values.length !== 1)
    ) {
      invalid();
    }
  }

  return { clientId, requestedScopes };
}

function validatedCallback(
  parameters: URLSearchParams,
  client: typeof oauthClient.$inferSelect | null | undefined,
): URL {
  const redirectUris = parameters.getAll("redirect_uri");
  const redirectUri = redirectUris[0];
  if (
    redirectUris.length !== 1 ||
    !redirectUri ||
    !client ||
    !isMcpPublicClientMetadata(client) ||
    !matchesRegisteredMcpRedirectUri(
      client.redirectUris,
      redirectUri,
      client.applicationType,
    )
  ) {
    throw badRequest("The OAuth client or redirect URI is invalid");
  }
  const callback = parseMcpRedirectUri(redirectUri);
  if (!callback) throw badRequest("The OAuth redirect URI is invalid");
  return callback;
}

async function assertSignedOAuthQuery(oauthQuery: string): Promise<void> {
  if (!(await isValidSignedOAuthQuery(oauthQuery))) {
    throw badRequest("The OAuth authorization request is invalid or expired");
  }
}

function authorizationCodeId(redirectUrl: string): Promise<string> {
  let code: string | null = null;
  try {
    code = new URL(redirectUrl).searchParams.get("code");
  } catch {
    // The provider response schema is checked separately; a malformed URL is
    // treated as a failed authorization rather than persisted as a grant.
  }
  if (!code) {
    throw new Error("OAuth consent did not return an authorization code");
  }
  return hashOAuthToken(code);
}

async function completeOAuthConsent(
  request: NextRequest,
  accept: boolean,
  oauthQuery: string,
): Promise<string> {
  let response: Response;
  try {
    response = await getAuth().api.oauth2Consent({
      request,
      headers: request.headers,
      body: { accept, oauth_query: oauthQuery },
      asResponse: true,
    });
  } catch (error) {
    if (
      error instanceof BetterAuthApiError &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      throw badRequest("The OAuth authorization request is invalid or expired");
    }
    throw error;
  }
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = oauthConsentErrorSchema.safeParse(payload);
    throw badRequest(
      error.success
        ? error.data.error_description ??
            error.data.message ??
            "OAuth consent failed"
        : "OAuth consent failed",
    );
  }

  const result = oauthConsentResultSchema.safeParse(payload);
  if (!result.success) {
    throw new Error("OAuth consent returned an invalid redirect response");
  }
  return result.data.url;
}

async function accessibleResources(ctx: Parameters<Parameters<typeof withAuth>[1]>[1]) {
  const productRows = await ctx.db
    .select({ id: products.id, tenantId: products.tenantId, name: products.name })
    .from(products)
    .where(productScopeCondition(ctx))
    .orderBy(products.name);

  const tenantIds = ctx.isSuperAdmin
    ? undefined
    : [...new Set([ctx.user.tenantId, ...productRows.map((row) => row.tenantId)])];
  const tenantRows = await ctx.db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(tenantIds ? inArray(tenants.id, tenantIds) : undefined)
    .orderBy(tenants.name);
  return { productRows, tenantRows };
}

const getAuthorizationContext = withAuth({}, async (request: NextRequest, ctx) => {
  const { oauth_query: oauthQuery } = parseQuery(request, oauthQuerySchema);
  await assertSignedOAuthQuery(oauthQuery);
  const parameters = oauthParameters(oauthQuery);
  const { clientId, requestedScopes } =
    assertMcpAuthorizationParameters(parameters);

  const [client, resources, existingGrant, agentReassignEnabled] = await Promise.all([
    ctx.db.query.oauthClient.findFirst({
      where: and(
        eq(oauthClient.clientId, clientId),
        eq(oauthClient.disabled, false),
      ),
    }),
    accessibleResources(ctx),
    ctx.db.query.mcpOauthGrants.findFirst({
      where: and(
        eq(mcpOauthGrants.userId, ctx.user.id),
        eq(mcpOauthGrants.clientId, clientId),
        isNull(mcpOauthGrants.revokedAt),
      ),
    }).then((grant) => (grant && isUsableMcpGrant(grant) ? grant : null)),
    hasAgentReassignmentTeam(ctx),
  ]);
  if (!client) throw notFound("OAuth client not found");
  const callback = validatedCallback(parameters, client);

  const availability = { agentReassignEnabled };
  const availablePermissions = availableMcpPermissions(ctx.role, availability);
  const accessibleTenantIds = new Set(
    resources.tenantRows.map((tenant) => tenant.id),
  );
  const accessibleProductIds = new Set(
    resources.productRows.map((product) => product.id),
  );
  const defaultPermissions = existingGrant
    ? effectiveMcpPermissions(
        ctx.role,
        parseStringArray(existingGrant.permissions),
        availability,
      )
    : availablePermissions.includes("tickets:read")
      ? ["tickets:read" as const]
      : availablePermissions.slice(0, 1);

  return ok({
    client: {
      id: client.clientId,
      name: client.name?.trim() || null,
      uri: client.uri ?? null,
    },
    callback: {
      host: callback.host,
      isLoopback: isMcpLoopbackHostname(callback.hostname),
    },
    requestedScopes,
    availablePermissions,
    defaultPermissions,
    defaultResourceMode: existingGrant?.resourceMode ?? "all",
    defaultTenantIds: existingGrant
      ? parseStringArray(existingGrant.tenantIds).filter((id) =>
          accessibleTenantIds.has(id),
        )
      : [],
    defaultProductIds: existingGrant
      ? parseStringArray(existingGrant.productIds).filter((id) =>
          accessibleProductIds.has(id),
        )
      : [],
    tenants: resources.tenantRows,
    products: resources.productRows,
  });
});

const submitAuthorization = withAuth({}, async (request: NextRequest, ctx) => {
  assertCanonicalTobOrigin(request, "OAuth consent");
  const body = await parseBody(request, consentSchema, 64 * 1024);
  await assertSignedOAuthQuery(body.oauthQuery);
  const parameters = oauthParameters(body.oauthQuery);
  const { clientId } = assertMcpAuthorizationParameters(parameters);

  const client = await ctx.db.query.oauthClient.findFirst({
    where: and(
      eq(oauthClient.clientId, clientId),
      eq(oauthClient.disabled, false),
    ),
  });
  if (!client) throw notFound("OAuth client not found");
  validatedCallback(parameters, client);

  if (!body.accept) {
    return ok({
      redirectUrl: await completeOAuthConsent(
        request,
        false,
        body.oauthQuery,
      ),
    });
  }

  const agentReassignEnabled = await hasAgentReassignmentTeam(ctx);
  const available = new Set(
    availableMcpPermissions(ctx.role, { agentReassignEnabled }),
  );
  const permissions = [...new Set(body.permissions)];
  if (
    permissions.length === 0 ||
    permissions.some((permission) => !available.has(permission))
  ) {
    throw forbidden("One or more MCP permissions exceed your current role");
  }

  const resources = await accessibleResources(ctx);
  const accessibleTenantIds = new Set(resources.tenantRows.map((row) => row.id));
  const accessibleProductIds = new Set(resources.productRows.map((row) => row.id));
  const tenantIds = [...new Set(body.tenantIds)];
  const selectedTenantIds = new Set(tenantIds);
  const productTenant = new Map(
    resources.productRows.map((product) => [product.id, product.tenantId]),
  );
  const productIds = [...new Set(body.productIds)].filter(
    (productId) => !selectedTenantIds.has(productTenant.get(productId) ?? ""),
  );

  if (
    body.resourceMode === "selected" &&
    (tenantIds.some((id) => !accessibleTenantIds.has(id)) ||
      productIds.some((id) => !accessibleProductIds.has(id)) ||
      tenantIds.length + productIds.length === 0)
  ) {
    throw forbidden("One or more MCP resources are outside your current scope");
  }

  const redirectUrl = await completeOAuthConsent(request, true, body.oauthQuery);

  const codeId = await authorizationCodeId(redirectUrl);
  try {
    await saveMcpGrant(ctx.db, {
      userId: ctx.user.id,
      clientId,
      authorizationCodeId: codeId,
      permissions,
      resourceMode: body.resourceMode,
      tenantIds,
      productIds,
    });
  } catch (error) {
    await discardMcpAuthorizationCode(ctx.db, codeId).catch((cleanupError) => {
      console.error("Failed to discard an unbound OAuth authorization code", cleanupError);
    });
    throw error;
  }

  return ok({ redirectUrl });
});

export const GET = withNoStoreHandler(getAuthorizationContext);
export const POST = withNoStoreHandler(submitAuthorization);
