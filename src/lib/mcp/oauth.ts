import { getEnv } from "@/lib/db";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";

export const MCP_OAUTH_SCOPE = "onfire:mcp";
export const MCP_ACCESS_TOKEN_PREFIX = "onfire_at_";
export const MCP_REFRESH_TOKEN_PREFIX = "onfire_rt_";
const SIGNATURE_PARAM = "sig";

function getCanonicalTobUrl(): URL {
  const value = getEnv().BETTER_AUTH_URL;
  if (typeof value !== "string" || value !== value.trim()) {
    throw new TypeError("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
  }
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
  }
  return url;
}

export function getMcpResourceUrl(): string {
  const url = new URL("/mcp", getCanonicalTobUrl());
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function getMcpAuthorizationServerUrl(): string {
  return new URL("/api/tob/auth", getCanonicalTobUrl())
    .toString()
    .replace(/\/$/, "");
}

export function getMcpResourceMetadataUrl(): string {
  return new URL(
    "/.well-known/oauth-protected-resource/mcp",
    getCanonicalTobUrl(),
  ).toString();
}

export function isCanonicalMcpResource(value: string | null): boolean {
  if (!value) return false;
  try {
    const candidate = new URL(value);
    const expected = new URL(getMcpResourceUrl());
    return (
      candidate.protocol.toLowerCase() === expected.protocol.toLowerCase() &&
      candidate.host.toLowerCase() === expected.host.toLowerCase() &&
      candidate.pathname === expected.pathname &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.search === "" &&
      candidate.hash === ""
    );
  } catch {
    return false;
  }
}

function canonicalizeOAuthQuery(params: URLSearchParams): string {
  const canonical = new URLSearchParams();
  const entries = [...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
    return 0;
  });
  for (const [key, value] of entries) canonical.append(key, value);
  return canonical.toString();
}

/** Verify the provider-signed consent query before displaying or accepting it. */
export async function isValidSignedOAuthQuery(value: string): Promise<boolean> {
  const params = new URLSearchParams(value);
  const signatures = params.getAll(SIGNATURE_PARAM);
  const expirations = params.getAll("exp");
  const expiresAt = Number(expirations[0]);
  params.delete(SIGNATURE_PARAM);
  if (
    signatures.length !== 1 ||
    !signatures[0] ||
    expirations.length !== 1 ||
    !Number.isFinite(expiresAt) ||
    expiresAt * 1000 < Date.now()
  ) {
    return false;
  }
  const expected = await makeSignature(
    canonicalizeOAuthQuery(params),
    getEnv().AUTH_SECRET,
  );
  return constantTimeEqual(signatures[0], expected);
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
): Response {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}
