import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { z } from "zod";
import { ApiError } from "@/lib/api/response";
import { getDb, type Database } from "@/lib/db";
import {
  bindCurrentMcpGrantAuthorization,
  discardMcpAuthorizationCode,
  hashOAuthToken,
  isMcpRevocationTokenOwnedByClient,
  isMcpTokenRequestBound,
} from "@/lib/mcp/grants";
import {
  getMcpAuthorizationServerUrl,
  isCanonicalMcpResource,
  MCP_OAUTH_SCOPE,
  oauthError,
} from "@/lib/mcp/oauth";
import { enforceStrictRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";
import {
  mcpRevocationSuccessResponse,
  normalizeMcpRevocationResponse,
} from "@/lib/mcp/revocation";
import { withNoStore } from "@/lib/http-cache";
import {
  isMcpPublicClientMetadata,
  matchesRegisteredMcpRedirectUri,
  parseMcpRedirectUri,
  type McpPublicClientMetadata,
} from "@/lib/mcp/oauth-client";

const EXPOSED_OAUTH_PATHS = new Set([
  "/oauth2/authorize",
  "/oauth2/token",
  "/oauth2/register",
  "/oauth2/revoke",
]);
const INVALID_OAUTH_PATH = "/__invalid_oauth_path__";

const S256_CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PKCE_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const MAX_AUTHORIZATION_QUERY_LENGTH = 8 * 1024;
const MAX_CLIENT_ID_LENGTH = 200;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_STATE_LENGTH = 1024;
const SUPPORTED_OAUTH_SCOPES = new Set([MCP_OAUTH_SCOPE, "offline_access"]);
const OAUTH_PROMPT_VALUES = new Set([
  "none",
  "consent",
  "login",
  "create",
  "select_account",
]);
const AUTHORIZATION_PARAMETERS = new Set([
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
]);
const AUTHORIZATION_PARAMETER_LIMITS = new Map<string, number>([
  ["client_id", MAX_CLIENT_ID_LENGTH],
  ["code_challenge", 128],
  ["code_challenge_method", 16],
  ["prompt", 128],
  ["redirect_uri", MAX_REDIRECT_URI_LENGTH],
  ["resource", MAX_REDIRECT_URI_LENGTH],
  ["response_mode", 16],
  ["response_type", 16],
  ["scope", 512],
  ["state", MAX_STATE_LENGTH],
]);
const AUTHORIZATION_CODE_TOKEN_PARAMETERS = new Set([
  "client_id",
  "code",
  "code_verifier",
  "grant_type",
  "redirect_uri",
  "resource",
]);
const REFRESH_TOKEN_PARAMETERS = new Set([
  "client_id",
  "grant_type",
  "refresh_token",
  "resource",
  "scope",
]);
const TOKEN_PARAMETERS = new Set([
  ...AUTHORIZATION_CODE_TOKEN_PARAMETERS,
  ...REFRESH_TOKEN_PARAMETERS,
]);
const REVOCATION_PARAMETERS = new Set([
  "client_id",
  "token",
  "token_type_hint",
]);
const PRIVATE_CLIENT_CREDENTIAL_PARAMETERS = new Set([
  "client_assertion",
  "client_assertion_type",
  "client_secret",
]);

function isSafeClientMetadataUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const clientMetadataUrlSchema = z
  .string()
  .max(2048)
  .refine(isSafeClientMetadataUrl);

const mcpRegistrationSchema = z
  .object({
    redirect_uris: z
      .array(z.string().max(MAX_REDIRECT_URI_LENGTH))
      .min(1)
      .max(20)
      .refine((uris) => new Set(uris).size === uris.length)
      .refine((uris) => uris.every((uri) => parseMcpRedirectUri(uri) !== null)),
    scope: z.string().max(512).optional(),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .min(1)
      .max(2)
      .refine((types) => new Set(types).size === types.length)
      .optional(),
    response_types: z.array(z.literal("code")).min(1).max(1).optional(),
    token_endpoint_auth_method: z.literal("none").optional(),
    application_type: z.enum(["native", "web"]).optional(),
    require_pkce: z.literal(true).optional(),
    dpop_bound_access_tokens: z.literal(false).optional(),
    skip_consent: z.never().optional(),
    client_name: z.string().max(200).optional(),
    client_uri: clientMetadataUrlSchema.optional(),
    logo_uri: clientMetadataUrlSchema.optional(),
    contacts: z.array(z.string().max(320)).max(20).optional(),
    tos_uri: clientMetadataUrlSchema.optional(),
    policy_uri: clientMetadataUrlSchema.optional(),
    software_id: z.string().max(200).optional(),
    software_version: z.string().max(100).optional(),
    software_statement: z.never().optional(),
    post_logout_redirect_uris: z.never().optional(),
    backchannel_logout_uri: z.never().optional(),
    backchannel_logout_session_required: z.never().optional(),
    jwks: z.never().optional(),
    jwks_uri: z.never().optional(),
    subject_type: z.never().optional(),
    resources: z
      .array(z.string().max(MAX_REDIRECT_URI_LENGTH))
      .max(1)
      .optional(),
  })
  .strict();

interface ValidatedOAuthPost {
  request: NextRequest;
  error: Response | null;
}

interface OAuthRedirectResponse {
  kind: "http" | "json";
  url: string;
}

interface OAuthAuthorizationError {
  error: "invalid_request" | "invalid_target";
  description: string;
}

function oauthPath(request: NextRequest): string | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const basePath = "/api/tob/auth";
  if (!pathname.startsWith(`${basePath}/`)) return null;
  const suffix = pathname.slice(basePath.length);
  if (suffix.includes("%") || suffix.includes("\\")) {
    return INVALID_OAUTH_PATH;
  }
  return suffix === "/oauth2" ||
    suffix.startsWith("/oauth2/") ||
    suffix === "/admin/oauth2" ||
    suffix.startsWith("/admin/oauth2/") ||
    suffix.startsWith("/.well-known/")
    ? suffix
    : null;
}

function validateOAuthConfiguration(path: string | null): Response | null {
  if (!path || !EXPOSED_OAUTH_PATHS.has(path)) return null;
  try {
    getMcpAuthorizationServerUrl();
    return null;
  } catch (error) {
    console.error("OAuth canonical URL configuration is invalid", error);
    return oauthError(
      "temporarily_unavailable",
      "The authorization service is temporarily unavailable",
      503,
    );
  }
}

function validateOAuthSurface(request: NextRequest): NextResponse | null {
  const path = oauthPath(request);
  if (!path) return null;
  if (!EXPOSED_OAUTH_PATHS.has(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expectedMethod = path === "/oauth2/authorize" ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    return NextResponse.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: expectedMethod } },
    );
  }

  return null;
}

function isSupportedScopeValue(value: string, requireMcp: boolean): boolean {
  const scopes = value.split(" ");
  return (
    scopes.length > 0 &&
    scopes.every(Boolean) &&
    new Set(scopes).size === scopes.length &&
    scopes.every((scope) => SUPPORTED_OAUTH_SCOPES.has(scope)) &&
    (!requireMcp || scopes.includes(MCP_OAUTH_SCOPE))
  );
}

function validateMcpAuthorizationRequest(
  request: NextRequest,
): OAuthAuthorizationError | null {
  const url = new URL(request.url);
  const params = url.searchParams;
  if (url.search.length - 1 > MAX_AUTHORIZATION_QUERY_LENGTH) {
    return {
      error: "invalid_request",
      description: "The authorization request is too large",
    };
  }
  for (const [name, value] of params) {
    if (!AUTHORIZATION_PARAMETERS.has(name)) {
      return {
        error: "invalid_request",
        description: "Unsupported authorization parameter",
      };
    }
    if (value.length > (AUTHORIZATION_PARAMETER_LIMITS.get(name) ?? 0)) {
      return {
        error: "invalid_request",
        description: "An authorization parameter is too long",
      };
    }
  }
  if (
    params.getAll("resource").length !== 1 ||
    !isCanonicalMcpResource(params.get("resource"))
  ) {
    return {
      error: "invalid_target",
      description: "The MCP resource is required",
    };
  }
  for (const name of AUTHORIZATION_PARAMETERS) {
    if (name !== "resource" && params.getAll(name).length > 1) {
      return {
        error: "invalid_request",
        description: `Authorization parameter must not be repeated: ${name}`,
      };
    }
  }
  if (
    params.getAll("client_id").length !== 1 ||
    !params.get("client_id") ||
    params.getAll("redirect_uri").length !== 1 ||
    !params.get("redirect_uri") ||
    params.getAll("response_type").length !== 1 ||
    params.get("response_type") !== "code"
  ) {
    return {
      error: "invalid_request",
      description: "A client, callback, and code response type are required",
    };
  }
  const responseMode = params.get("response_mode");
  if (responseMode !== null && responseMode !== "query") {
    return {
      error: "invalid_request",
      description: "Only query response mode is supported",
    };
  }
  const scope = params.get("scope");
  if (
    params.getAll("scope").length !== 1 ||
    scope === null ||
    !isSupportedScopeValue(scope, true)
  ) {
    return {
      error: "invalid_request",
      description: "The authorization scope is invalid",
    };
  }
  const prompt = params.get("prompt");
  if (prompt !== null) {
    const values = prompt.split(" ");
    if (
      values.some((value) => !value || !OAUTH_PROMPT_VALUES.has(value)) ||
      new Set(values).size !== values.length ||
      (values.includes("none") && values.length !== 1)
    ) {
      return {
        error: "invalid_request",
        description: "The authorization prompt is invalid",
      };
    }
  }
  if (
    params.getAll("code_challenge").length !== 1 ||
    !S256_CODE_CHALLENGE_PATTERN.test(params.get("code_challenge") ?? "") ||
    params.getAll("code_challenge_method").length !== 1 ||
    params.get("code_challenge_method") !== "S256"
  ) {
    return {
      error: "invalid_request",
      description: "PKCE S256 is required",
    };
  }
  return null;
}

async function validateMcpPublicClientId(
  clientId: string,
): Promise<Response | null> {
  let client: McpPublicClientMetadata | undefined;
  try {
    client = await getDb().query.oauthClient.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.clientId, clientId), eq(table.disabled, false)),
      columns: {
        applicationType: true,
        clientSecret: true,
        clientDiscoveryId: true,
        dpopBoundAccessTokens: true,
        grantTypes: true,
        redirectUris: true,
        requirePKCE: true,
        responseTypes: true,
        skipConsent: true,
        tokenEndpointAuthMethod: true,
      },
    });
  } catch (error) {
    console.error("OAuth client validation failed", error);
    return oauthError(
      "temporarily_unavailable",
      "The authorization service is temporarily unavailable",
      503,
    );
  }
  return isMcpPublicClientMetadata(client)
    ? null
    : oauthError("invalid_client", "The OAuth client is invalid");
}

async function validateMcpAuthorizationClient(
  request: NextRequest,
): Promise<Response | null> {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id")!;
  const redirectUri = params.get("redirect_uri")!;
  let client: McpPublicClientMetadata | undefined;
  try {
    client = await getDb().query.oauthClient.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.clientId, clientId), eq(table.disabled, false)),
      columns: {
        applicationType: true,
        clientSecret: true,
        clientDiscoveryId: true,
        dpopBoundAccessTokens: true,
        grantTypes: true,
        redirectUris: true,
        requirePKCE: true,
        responseTypes: true,
        skipConsent: true,
        tokenEndpointAuthMethod: true,
      },
    });
  } catch (error) {
    console.error("OAuth client validation failed", error);
    return oauthError(
      "temporarily_unavailable",
      "The authorization service is temporarily unavailable",
      503,
    );
  }
  if (
    !isMcpPublicClientMetadata(client) ||
    !matchesRegisteredMcpRedirectUri(
      client.redirectUris,
      redirectUri,
      client.applicationType,
    )
  ) {
    return oauthError(
      "invalid_request",
      "The OAuth client or redirect URI is invalid",
    );
  }
  return null;
}

async function authorizationErrorResponse(
  request: NextRequest,
  oauthErrorDetails: OAuthAuthorizationError,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const clientIds = params.getAll("client_id");
  const redirectUris = params.getAll("redirect_uri");
  if (
    clientIds.length !== 1 ||
    !clientIds[0] ||
    clientIds[0].length > MAX_CLIENT_ID_LENGTH ||
    redirectUris.length !== 1 ||
    !redirectUris[0] ||
    redirectUris[0].length > MAX_REDIRECT_URI_LENGTH
  ) {
    return oauthError(
      oauthErrorDetails.error,
      oauthErrorDetails.description,
    );
  }

  let client: McpPublicClientMetadata | undefined;
  try {
    client = await getDb().query.oauthClient.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.clientId, clientIds[0]), eq(table.disabled, false)),
      columns: {
        applicationType: true,
        clientSecret: true,
        clientDiscoveryId: true,
        dpopBoundAccessTokens: true,
        grantTypes: true,
        redirectUris: true,
        requirePKCE: true,
        responseTypes: true,
        skipConsent: true,
        tokenEndpointAuthMethod: true,
      },
    });
  } catch (error) {
    console.error("OAuth redirect URI validation failed", error);
    return oauthError(
      "temporarily_unavailable",
      "The authorization service is temporarily unavailable",
      503,
    );
  }

  if (
    !isMcpPublicClientMetadata(client) ||
    !matchesRegisteredMcpRedirectUri(
      client.redirectUris,
      redirectUris[0],
      client.applicationType,
    )
  ) {
    return oauthError(
      oauthErrorDetails.error,
      oauthErrorDetails.description,
    );
  }

  const callback = new URL(redirectUris[0]);
  callback.searchParams.delete("code");
  callback.searchParams.delete("state");
  callback.searchParams.set("error", oauthErrorDetails.error);
  callback.searchParams.set("error_description", oauthErrorDetails.description);
  const states = params.getAll("state");
  if (states.length === 1 && states[0].length <= MAX_STATE_LENGTH) {
    callback.searchParams.set("state", states[0]);
  }
  callback.searchParams.set("iss", getMcpAuthorizationServerUrl());

  return new Response(null, {
    status: 302,
    headers: {
      Location: callback.toString(),
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

function requireMcpConsent(request: NextRequest, path: string | null): NextRequest {
  if (path !== "/oauth2/authorize") return request;

  const url = new URL(request.url);
  const prompts = url.searchParams.getAll("prompt");
  if (prompts.length > 1) return request;

  const promptValues =
    prompts[0]
      ?.split(" ")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  if (prompts.length === 1 && promptValues.length === 0) return request;
  if (promptValues.some((value) => !OAUTH_PROMPT_VALUES.has(value))) {
    return request;
  }
  if (promptValues.includes("none") || promptValues.includes("consent")) {
    return request;
  }

  url.searchParams.set("prompt", [...promptValues, "consent"].join(" "));
  return new NextRequest(url, {
    method: request.method,
    headers: request.headers,
  });
}

function isPromptNoneAuthorization(request: Request): boolean {
  const prompts = new URL(request.url).searchParams.getAll("prompt");
  if (prompts.length !== 1) return false;
  return prompts[0]
    .split(" ")
    .filter(Boolean)
    .includes("none");
}

async function bindNonInteractiveAuthorization(
  response: Response,
  request: NextRequest,
): Promise<Response> {
  if (!isPromptNoneAuthorization(request)) return response;
  const redirect = await readOAuthRedirectResponse(response);
  if (!redirect) return response;

  let callback: URL;
  try {
    callback = new URL(redirect.url, request.url);
  } catch {
    return response;
  }
  const code = callback.searchParams.get("code");
  const clientId = new URL(request.url).searchParams.get("client_id");
  if (!code || !clientId) return response;

  const authorizationCodeId = await hashOAuthToken(code);
  let error = "consent_required";
  let description = "An active OnFire MCP grant is required";
  try {
    const db = getDb();
    const bound = await bindCurrentMcpGrantAuthorization(db, {
      authorizationCodeId,
      userId: await authorizationUserId(db, authorizationCodeId),
      clientId,
    });
    if (bound) return response;
    await discardMcpAuthorizationCode(db, authorizationCodeId);
  } catch (cause) {
    console.error("Failed to bind non-interactive MCP authorization", cause);
    error = "temporarily_unavailable";
    description = "The authorization service is temporarily unavailable";
    try {
      await discardMcpAuthorizationCode(getDb(), authorizationCodeId);
    } catch (cleanupError) {
      console.error(
        "Failed to discard non-interactive MCP authorization code",
        cleanupError,
      );
    }
  }
  callback.searchParams.delete("code");
  callback.searchParams.set("error", error);
  callback.searchParams.set("error_description", description);
  return replaceOAuthRedirectResponse(response, redirect.kind, callback);
}

async function readOAuthRedirectResponse(
  response: Response,
): Promise<OAuthRedirectResponse | null> {
  const location = response.headers.get("location");
  if (location) return { kind: "http", url: location };

  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") return null;
  const payload: unknown = await response.clone().json().catch(() => null);
  const parsed = z
    .object({ redirect: z.literal(true), url: z.string().min(1) })
    .safeParse(payload);
  return parsed.success ? { kind: "json", url: parsed.data.url } : null;
}

function replaceOAuthRedirectResponse(
  response: Response,
  kind: OAuthRedirectResponse["kind"],
  callback: URL,
): Response {
  if (kind === "http") {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("Location", callback.toString());
    headers.set("Cache-Control", "no-store");
    headers.set("Pragma", "no-cache");
    return new Response(null, {
      status: 302,
      headers,
    });
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return Response.json(
    { redirect: true, url: callback.toString() },
    { status: response.status, headers },
  );
}

async function authorizationUserId(
  db: Database,
  authorizationCodeId: string,
): Promise<string> {
  const verification = await db.query.verification.findFirst({
    where: (table, { eq }) => eq(table.identifier, authorizationCodeId),
  });
  if (!verification) throw new Error("OAuth authorization code was not persisted");
  const value: unknown = JSON.parse(verification.value);
  const parsed = z.object({
    type: z.literal("authorization_code"),
    userId: z.string().min(1),
  }).safeParse(value);
  if (!parsed.success) throw new Error("OAuth authorization code is malformed");
  return parsed.data.userId;
}

async function validateOAuthPostBody(
  request: NextRequest,
  path: string | null,
): Promise<ValidatedOAuthPost> {
  if (!path || path === "/oauth2/authorize") {
    return { request, error: null };
  }

  const expectedMediaType =
    path === "/oauth2/register"
      ? "application/json"
      : "application/x-www-form-urlencoded";
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== expectedMediaType) {
    return {
      request,
      error: oauthError(
        "invalid_request",
        `${expectedMediaType} request body required`,
      ),
    };
  }

  if (
    path === "/oauth2/register" ||
    path === "/oauth2/token" ||
    path === "/oauth2/revoke"
  ) {
    if (request.headers.has("dpop")) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "DPoP is not supported by this OAuth profile",
        ),
      };
    }
    if (request.headers.has("authorization")) {
      return {
        request,
        error: oauthError(
          path === "/oauth2/register"
            ? "invalid_client_metadata"
            : "invalid_client",
          path === "/oauth2/register"
            ? "Authenticated client registration is not supported"
            : "Public clients must send client_id in the request body",
        ),
      };
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBodyBytes(request.clone(), 64 * 1024);
  } catch (error) {
    return {
      request,
      error:
        error instanceof ApiError
          ? oauthError("invalid_request", error.message, error.status)
          : oauthError("invalid_request", "Invalid request body"),
    };
  }

  if (path === "/oauth2/register") {
    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      return {
        request,
        error: oauthError(
          "invalid_client_metadata",
          "Invalid JSON registration request",
        ),
      };
    }
    const registration = mcpRegistrationSchema.safeParse(payload);
    if (!registration.success) {
      return {
        request,
        error: oauthError(
          "invalid_client_metadata",
          "Invalid MCP client registration metadata",
        ),
      };
    }
    const scopes = (registration.data.scope ?? MCP_OAUTH_SCOPE)
      .split(" ");
    if (!isSupportedScopeValue(scopes.join(" "), true)) {
      return {
        request,
        error: oauthError(
          "invalid_client_metadata",
          `Client registration scopes must include only ${MCP_OAUTH_SCOPE} and optional offline_access`,
        ),
      };
    }
    if (
      registration.data.resources !== undefined &&
      (registration.data.resources.length !== 1 ||
        !isCanonicalMcpResource(registration.data.resources[0] ?? null))
    ) {
      return {
        request,
        error: oauthError(
          "invalid_client_metadata",
          "Client registration resources must contain only the canonical MCP resource",
        ),
      };
    }
    if (
      registration.data.grant_types &&
      !registration.data.grant_types.includes("authorization_code")
    ) {
      return {
        request,
        error: oauthError(
          "invalid_client_metadata",
          "The authorization_code grant is required",
        ),
      };
    }

    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return {
      request: new NextRequest(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify({
          ...(payload as Record<string, unknown>),
          token_endpoint_auth_method: "none",
          application_type: registration.data.application_type ?? "native",
          require_pkce: true,
          dpop_bound_access_tokens: false,
        }),
      }),
      error: null,
    };
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return {
      request,
      error: oauthError(
        "invalid_request",
        "Invalid form-encoded OAuth request",
      ),
    };
  }

  const privateCredential = [...PRIVATE_CLIENT_CREDENTIAL_PARAMETERS].some(
    (name) => form.has(name),
  );
  if (privateCredential) {
    return {
      request,
      error: oauthError(
        "invalid_client",
        "Client secrets and assertions are not supported",
      ),
    };
  }

  if (path === "/oauth2/revoke") {
    for (const [name, value] of form) {
      if (!REVOCATION_PARAMETERS.has(name)) {
        return {
          request,
          error: oauthError(
            "invalid_request",
            "Unsupported token revocation parameter",
          ),
        };
      }
      const limit = name === "client_id" ? MAX_CLIENT_ID_LENGTH : 4096;
      if (value.length > limit) {
        return {
          request,
          error: oauthError(
            "invalid_request",
            "Token revocation parameter is too long",
          ),
        };
      }
    }
    for (const name of REVOCATION_PARAMETERS) {
      if (form.getAll(name).length > 1) {
        return {
          request,
          error: oauthError(
            "invalid_request",
            "Token revocation parameters must not be repeated",
          ),
        };
      }
    }
    if (!form.get("client_id") || !form.get("token")) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "A client_id and token are required for revocation",
        ),
      };
    }
    const invalidClient = await validateMcpPublicClientId(
      form.get("client_id")!,
    );
    if (invalidClient) return { request, error: invalidClient };
    try {
      if (!(await isMcpRevocationTokenOwnedByClient(getDb(), form))) {
        return { request, error: mcpRevocationSuccessResponse() };
      }
    } catch (error) {
      console.error("MCP OAuth revocation ownership check failed", error);
      return {
        request,
        error: oauthError(
          "temporarily_unavailable",
          "The authorization service is temporarily unavailable",
          503,
        ),
      };
    }
    const token = form.get("token")!.replace(/^Bearer\s+/i, "");
    form.set("token", token);
    form.set(
      "token_type_hint",
      token.startsWith("onfire_at_") ? "access_token" : "refresh_token",
    );
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return {
      request: new NextRequest(request.url, {
        method: request.method,
        headers,
        body: form.toString(),
      }),
      error: null,
    };
  }

  for (const [name, value] of form) {
    if (!TOKEN_PARAMETERS.has(name)) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "Unsupported token request parameter",
        ),
      };
    }
    const limit =
      name === "redirect_uri" || name === "resource"
        ? MAX_REDIRECT_URI_LENGTH
        : name === "client_id"
          ? MAX_CLIENT_ID_LENGTH
          : name === "scope"
            ? 512
            : 4096;
    if (value.length > limit) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "Token request parameter is too long",
        ),
      };
    }
  }
  for (const name of TOKEN_PARAMETERS) {
    if (form.getAll(name).length > 1) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "Token request parameters must not be repeated",
        ),
      };
    }
  }

  const resources = form.getAll("resource");
  if (resources.length !== 1 || !isCanonicalMcpResource(resources[0])) {
    return {
      request,
      error: oauthError("invalid_target", "The MCP resource is required"),
    };
  }
  const grantType = form.get("grant_type");
  const allowedParameters =
    grantType === "authorization_code"
      ? AUTHORIZATION_CODE_TOKEN_PARAMETERS
      : grantType === "refresh_token"
        ? REFRESH_TOKEN_PARAMETERS
        : null;
  if (!allowedParameters) {
    return {
      request,
      error: oauthError(
        "unsupported_grant_type",
        "Only authorization_code and refresh_token grants are supported",
      ),
    };
  }
  if ([...form.keys()].some((name) => !allowedParameters.has(name))) {
    return {
      request,
      error: oauthError(
        "invalid_request",
        "The token request contains fields for another grant type",
      ),
    };
  }
  const clientId = form.get("client_id");
  if (!clientId) {
    return {
      request,
      error: oauthError("invalid_request", "A client_id is required"),
    };
  }
  const invalidClient = await validateMcpPublicClientId(clientId);
  if (invalidClient) return { request, error: invalidClient };
  if (grantType === "authorization_code") {
    if (
      !form.get("code") ||
      !form.get("redirect_uri") ||
      !PKCE_CODE_VERIFIER_PATTERN.test(form.get("code_verifier") ?? "")
    ) {
      return {
        request,
        error: oauthError(
          "invalid_request",
          "Code, redirect_uri, and a valid PKCE verifier are required",
        ),
      };
    }
  } else {
    if (!form.get("refresh_token")) {
      return {
        request,
        error: oauthError("invalid_request", "A refresh_token is required"),
      };
    }
    const scope = form.get("scope");
    if (scope !== null && !isSupportedScopeValue(scope, true)) {
      return {
        request,
        error: oauthError("invalid_scope", "The refresh scope is invalid"),
      };
    }
  }
  let bound: boolean;
  try {
    bound = await isMcpTokenRequestBound(getDb(), form);
  } catch (error) {
    console.error("MCP OAuth token binding check failed", error);
    return {
      request,
      error: oauthError(
        "temporarily_unavailable",
        "The authorization service is temporarily unavailable",
        503,
      ),
    };
  }
  if (!bound) {
    return {
      request,
      error: oauthError(
        "invalid_grant",
        "The OAuth token request is not bound to an active OnFire grant",
      ),
    };
  }
  return { request, error: null };
}

async function enforceOAuthRateLimit(
  request: NextRequest,
  path: string | null,
): Promise<Response | null> {
  const options =
    path === "/oauth2/authorize"
      ? { scope: "oauth:authorize", limit: 120, windowSeconds: 60 }
      : path === "/oauth2/register"
      ? { scope: "oauth:dcr", limit: 20, windowSeconds: 60 * 60 }
      : path === "/oauth2/token" || path === "/oauth2/revoke"
        ? {
            scope: `oauth:${path.slice("/oauth2/".length)}`,
            limit: 120,
            windowSeconds: 60,
          }
        : null;
  if (!options) return null;

  try {
    await enforceStrictRateLimit(getDb(), request, options.scope, options);
    return null;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("OAuth rate limit check failed", error);
      return oauthError(
        "temporarily_unavailable",
        "The authorization service is temporarily unavailable",
        503,
      );
    }
    const response = oauthError(
      "temporarily_unavailable",
      error.message,
      error.status,
    );
    const retryAfter =
      typeof error.details === "object" && error.details !== null
        ? (error.details as { retryAfter?: number }).retryAfter
        : undefined;
    if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
    return response;
  }
}

export async function GET(request: NextRequest) {
  const rejected = validateOAuthSurface(request);
  if (rejected) return withNoStore(rejected);
  const path = oauthPath(request);
  const configurationError = validateOAuthConfiguration(path);
  if (configurationError) return withNoStore(configurationError);
  const rateLimited = await enforceOAuthRateLimit(request, path);
  if (rateLimited) return path ? withNoStore(rateLimited) : rateLimited;
  if (path === "/oauth2/authorize") {
    const authorizationError = validateMcpAuthorizationRequest(request);
    if (authorizationError) {
      return withNoStore(
        await authorizationErrorResponse(request, authorizationError),
      );
    }
    const invalidClient = await validateMcpAuthorizationClient(request);
    if (invalidClient) return withNoStore(invalidClient);
  }
  const oauthRequest = requireMcpConsent(request, path);
  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  const response = await bindNonInteractiveAuthorization(
    await handler.GET(oauthRequest),
    oauthRequest,
  );
  return path ? withNoStore(response) : response;
}

export async function POST(request: NextRequest) {
  const rejected = validateOAuthSurface(request);
  if (rejected) return withNoStore(rejected);

  const path = oauthPath(request);
  const configurationError = validateOAuthConfiguration(path);
  if (configurationError) return withNoStore(configurationError);
  const rateLimited = await enforceOAuthRateLimit(request, path);
  if (rateLimited) return path ? withNoStore(rateLimited) : rateLimited;

  const validated = await validateOAuthPostBody(request, path);
  if (validated.error) {
    return path ? withNoStore(validated.error) : validated.error;
  }
  const oauthRequest = validated.request;

  // OnFire is invite-only. Installation and authorized user management call
  // Better Auth server-side; exposing this endpoint would create auth users
  // without an application profile or RBAC scope.
  if (
    new URL(oauthRequest.url).pathname
      .replace(/\/+$/, "")
      .endsWith("/sign-up/email")
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = getAuth();
  const handler = toNextJsHandler(auth.handler);
  const response = await handler.POST(oauthRequest);
  const normalized =
    path === "/oauth2/revoke"
      ? await normalizeMcpRevocationResponse(response)
      : response;
  return path ? withNoStore(normalized) : normalized;
}
