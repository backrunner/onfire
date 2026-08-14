import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/auth/server";
import {
  OAUTH_METADATA_CACHE_CONTROL,
  mcpMetadataUnavailableResponse,
  sanitizeMcpAuthorizationServerMetadata,
} from "@/lib/mcp/metadata";

export async function GET(request: Request): Promise<Response> {
  try {
    const response = await oauthProviderAuthServerMetadata(getAuth(), {
      headers: { "Cache-Control": OAUTH_METADATA_CACHE_CONTROL },
    })(request);
    if (!response.ok) {
      throw new Error(`OAuth provider metadata returned ${response.status}`);
    }
    const metadata: unknown = await response.json();
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("OAuth provider metadata is malformed");
    }
    return Response.json(
      sanitizeMcpAuthorizationServerMetadata(
        metadata as Record<string, unknown>,
      ),
      { headers: { "Cache-Control": OAUTH_METADATA_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("OAuth authorization-server metadata failed", error);
    return mcpMetadataUnavailableResponse();
  }
}
