import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiError } from "@/lib/api/response";
import { getDb, type Database } from "@/lib/db";
import {
  authenticateMcpRequest,
  type McpGrantContext,
  mcpUnauthorizedResponse,
} from "@/lib/mcp/grants";
import { MCP_OAUTH_SCOPE, getMcpResourceUrl } from "@/lib/mcp/oauth";
import { createMcpServer } from "@/lib/mcp/server";
import { enforceStrictRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";
import { withNoStore } from "@/lib/http-cache";

export const runtime = "nodejs";

function methodNotAllowed(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function requestError(status: number, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32600, message },
      id: null,
    },
    { status },
  );
}

function configuredMcpResource(): URL | Response {
  try {
    return new URL(getMcpResourceUrl());
  } catch (error) {
    console.error("MCP canonical URL configuration is invalid", error);
    return requestError(503, "Service temporarily unavailable");
  }
}

function validateMcpOrigin(
  request: Request,
  canonicalOrigin: string,
): Response | null {
  const origin = request.headers.get("origin");
  if (origin === null) return null;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return requestError(403, "Forbidden origin");
  }
  if (
    origin !== parsed.origin ||
    parsed.origin !== canonicalOrigin
  ) {
    return requestError(403, "Forbidden origin");
  }
  return null;
}

async function enforceMcpRateLimit(
  db: Database,
  request: NextRequest,
  scope: string,
  limit: number,
  identity?: string,
): Promise<Response | null> {
  try {
    await enforceStrictRateLimit(
      db,
      request,
      scope,
      { limit, windowSeconds: 60 },
      identity,
    );
    return null;
  } catch (error) {
    if (error instanceof ApiError) {
      const retryAfter =
        typeof error.details === "object" && error.details !== null
          ? String(
              (error.details as { retryAfter?: number }).retryAfter ?? 60,
            )
          : "60";
      const response = requestError(error.status, error.message);
      response.headers.set("Retry-After", retryAfter);
      return response;
    }
    console.error("MCP rate limit check failed", error);
    return requestError(503, "Service temporarily unavailable");
  }
}

function hasJsonContentType(request: Request): boolean {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
  );
}

async function handleMcpPost(request: NextRequest): Promise<Response> {
  const resource = configuredMcpResource();
  if (resource instanceof Response) return resource;

  const invalidOrigin = validateMcpOrigin(request, resource.origin);
  if (invalidOrigin) return invalidOrigin;

  const boundary = await authenticateAndRateLimit(request);
  if (boundary instanceof Response) return boundary;
  const context = boundary;

  if (!hasJsonContentType(request)) {
    return requestError(415, "application/json request body required");
  }

  let parsedBody: unknown;
  try {
    const bytes = await readBodyBytes(request, 1024 * 1024);
    parsedBody = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) {
      return requestError(error.status, error.message);
    }
    return requestError(400, "Invalid JSON request body");
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(context);
  await server.connect(transport);

  try {
    const authorization = request.headers.get("authorization") ?? "";
    const response = await transport.handleRequest(request, {
      parsedBody,
      authInfo: {
        token: authorization.replace(/^Bearer\s+/i, ""),
        clientId: context.oauthClient.clientId,
        scopes: [MCP_OAUTH_SCOPE],
        resource,
        extra: {
          userId: context.user.id,
          grantId: context.grant.id,
        },
      },
    });
    return response;
  } finally {
    await server.close();
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return withNoStore(await handleMcpPost(request));
}

async function authenticateAndRateLimit(
  request: NextRequest,
): Promise<Response | McpGrantContext> {
  let publicDb: Database;
  try {
    publicDb = getDb();
  } catch (error) {
    console.error("MCP public database lookup failed", error);
    return requestError(503, "Service temporarily unavailable");
  }

  const publicRateLimited = await enforceMcpRateLimit(
    publicDb,
    request,
    "mcp:public",
    600,
  );
  if (publicRateLimited) return publicRateLimited;

  let context: McpGrantContext | null;
  try {
    context = await authenticateMcpRequest(request);
  } catch (error) {
    console.error("MCP bearer authentication failed", error);
    return requestError(503, "Service temporarily unavailable");
  }
  if (!context) {
    return mcpUnauthorizedResponse(request.headers.has("authorization"));
  }

  const grantRateLimited = await enforceMcpRateLimit(
    context.db,
    request,
    "mcp:request",
    120,
    context.grant.id,
  );
  if (grantRateLimited) return grantRateLimited;

  return context;
}

export async function GET(request: NextRequest): Promise<Response> {
  const resource = configuredMcpResource();
  if (resource instanceof Response) return withNoStore(resource);

  const invalidOrigin = validateMcpOrigin(request, resource.origin);
  if (invalidOrigin) return withNoStore(invalidOrigin);

  const boundary = await authenticateAndRateLimit(request);
  return withNoStore(
    boundary instanceof Response ? boundary : methodNotAllowed(),
  );
}

export const DELETE = GET;
export const HEAD = GET;
export const OPTIONS = GET;
export const PATCH = GET;
export const PUT = GET;
