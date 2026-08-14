const MCP_LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_MCP_REDIRECT_URI_LENGTH = 2048;
const MAX_MCP_REDIRECT_URIS = 20;

export interface McpPublicClientMetadata {
  applicationType: unknown;
  clientSecret?: unknown;
  clientDiscoveryId: unknown;
  dpopBoundAccessTokens: unknown;
  grantTypes: unknown;
  redirectUris: unknown;
  requirePKCE: unknown;
  responseTypes: unknown;
  skipConsent: unknown;
  tokenEndpointAuthMethod: unknown;
}

function parseStringArray(value: unknown): string[] | null {
  let current = value;
  for (let depth = 0; depth < 2 && typeof current === "string"; depth += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(current) ||
    current.some((item) => typeof item !== "string")
  ) {
    return null;
  }
  const values = current as string[];
  return new Set(values).size === values.length ? values : null;
}

function hasExactValues(
  values: readonly string[] | null,
  expected: readonly string[],
): boolean {
  return Boolean(
    values &&
      values.length === expected.length &&
      expected.every((value) => values.includes(value)),
  );
}

export function isMcpLoopbackHostname(hostname: string): boolean {
  return MCP_LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

export function parseMcpRedirectUri(value: string): URL | null {
  if (
    value.length === 0 ||
    value.length > MAX_MCP_REDIRECT_URI_LENGTH ||
    value !== value.trim()
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash) return null;
  if (url.protocol === "https:") {
    return /^https:\/\/[^/?#]+/i.test(value) ? url : null;
  }
  if (url.protocol !== "http:" || !isMcpLoopbackHostname(url.hostname)) {
    return null;
  }
  const authority = /^http:\/\/([^/?#]*)/i.exec(value)?.[1]?.toLowerCase();
  if (!authority) return null;
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(authority)
    ? url
    : null;
}

export function hasValidMcpRedirectUris(
  redirectUris: unknown,
  applicationType: unknown,
): boolean {
  if (applicationType !== "native" && applicationType !== "web") return false;
  const values = parseStringArray(redirectUris);
  return (
    values !== null &&
    values.length > 0 &&
    values.length <= MAX_MCP_REDIRECT_URIS &&
    values.every((value) => parseMcpRedirectUri(value) !== null)
  );
}

export function isMcpPublicClientMetadata(
  client: McpPublicClientMetadata | null | undefined,
): client is McpPublicClientMetadata {
  if (!client) return false;
  const grantTypes = parseStringArray(client.grantTypes);
  const responseTypes = parseStringArray(client.responseTypes);
  const hasClientSecret =
    client.clientSecret != null && client.clientSecret !== "";
  return (
    hasValidMcpRedirectUris(client.redirectUris, client.applicationType) &&
    !hasClientSecret &&
    client.clientDiscoveryId == null &&
    client.dpopBoundAccessTokens === false &&
    (hasExactValues(grantTypes, ["authorization_code"]) ||
      hasExactValues(grantTypes, [
        "authorization_code",
        "refresh_token",
      ])) &&
    hasExactValues(responseTypes, ["code"]) &&
    // Better Auth stores the server-default PKCE policy as NULL for public
    // dynamic clients. Only an explicit false is unsafe; the HTTP boundary
    // still requires an S256 challenge on every authorization request.
    client.requirePKCE !== false &&
    client.skipConsent !== true &&
    client.tokenEndpointAuthMethod === "none"
  );
}

export function matchesRegisteredMcpRedirectUri(
  registeredUris: unknown,
  requestedUri: string,
  applicationType: unknown,
): boolean {
  if (!hasValidMcpRedirectUris(registeredUris, applicationType)) return false;
  const requested = parseMcpRedirectUri(requestedUri);
  if (!requested) return false;

  const registeredValues = parseStringArray(registeredUris);
  if (!registeredValues) return false;

  return registeredValues.some((registeredUri) => {
    if (registeredUri === requestedUri) return true;
    const registered = parseMcpRedirectUri(registeredUri);
    return Boolean(
      registered &&
        applicationType === "native" &&
        registered.protocol === "http:" &&
        requested.protocol === "http:" &&
        isMcpLoopbackHostname(registered.hostname) &&
        registered.hostname === requested.hostname &&
        registered.pathname === requested.pathname &&
        registered.search === requested.search,
    );
  });
}
