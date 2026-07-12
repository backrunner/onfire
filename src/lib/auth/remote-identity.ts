import { z } from "zod";

export const REMOTE_IDENTITY_PROTOCOL = "onfire-userinfo-v1";
export const REMOTE_IDENTITY_SECRET_PURPOSE = "product-identity-resolver";

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;

const identityResponseSchema = z
  .object({
    externalId: z.string().min(1).max(256),
    email: z.string().email().max(320).nullable().optional(),
    level: z.number().int().min(0).max(100).nullable().optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type RemoteCustomerIdentity = z.infer<typeof identityResponseSchema>;

function isIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/**
 * Resolver URLs are administrator-provided but still treated as untrusted:
 * only public-looking HTTPS hostnames on the default port are accepted.
 */
export function safeIdentityEndpoint(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      url.hash ||
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home.arpa") ||
      hostname.endsWith(".onion") ||
      isIpv4(hostname) ||
      hostname.includes(":")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Identity response is too large");
  }
  if (!response.body) throw new Error("Identity response is empty");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Identity response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function resolveRemoteCustomerIdentity(
  input: {
    endpointUrl: string;
    authSecret: string;
    productId: string;
    credential: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<RemoteCustomerIdentity> {
  const endpoint = safeIdentityEndpoint(input.endpointUrl);
  if (!endpoint) throw new Error("Unsafe identity resolver URL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.authSecret}`,
        "content-type": "application/json",
        "x-onfire-identity-protocol": REMOTE_IDENTITY_PROTOCOL,
      },
      body: JSON.stringify({
        credential: input.credential,
        productId: input.productId,
      }),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Identity resolver redirects are not allowed");
    }
    if (response.status === 401 || response.status === 403) {
      throw new RemoteIdentityRejectedError();
    }
    if (!response.ok) {
      throw new Error(`Identity resolver failed (${response.status})`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new Error("Identity resolver must return JSON");
    }
    const parsed = identityResponseSchema.parse(await readLimitedJson(response));
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      throw new RemoteIdentityRejectedError();
    }
    return parsed;
  } finally {
    // Keep the abort timer active while the bounded response body is read.
    clearTimeout(timeout);
  }
}

export class RemoteIdentityRejectedError extends Error {
  constructor() {
    super("Remote identity credential was rejected");
    this.name = "RemoteIdentityRejectedError";
  }
}
