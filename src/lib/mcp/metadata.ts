import type { ResourceServerMetadata } from "@better-auth/oauth-provider";
import {
  MCP_OAUTH_SCOPE,
  getMcpAuthorizationServerUrl,
  getMcpResourceUrl,
} from "@/lib/mcp/oauth";

export const OAUTH_METADATA_CACHE_CONTROL =
  "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400";

export function mcpProtectedResourceMetadata(): ResourceServerMetadata {
  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [getMcpAuthorizationServerUrl()],
    scopes_supported: [MCP_OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "OnFire MCP",
  };
}

export function mcpProtectedResourceMetadataResponse(): Response {
  try {
    return Response.json(mcpProtectedResourceMetadata(), {
      headers: { "Cache-Control": OAUTH_METADATA_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("MCP protected-resource metadata configuration is invalid", error);
    return mcpMetadataUnavailableResponse();
  }
}

export function sanitizeMcpAuthorizationServerMetadata(
  _metadata: Record<string, unknown>,
): Record<string, unknown> {
  const issuer = getMcpAuthorizationServerUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth2/authorize`,
    token_endpoint: `${issuer}/oauth2/token`,
    registration_endpoint: `${issuer}/oauth2/register`,
    revocation_endpoint: `${issuer}/oauth2/revoke`,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [MCP_OAUTH_SCOPE, "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}

export function mcpMetadataUnavailableResponse(): Response {
  return Response.json(
    {
      error: "temporarily_unavailable",
      error_description: "OAuth metadata is temporarily unavailable",
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
