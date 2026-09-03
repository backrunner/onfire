import type { NextRequest } from "next/server";
import {
  base64ToBytes,
  hmacSha256Base64,
  hmacSha256Hex,
  timingSafeEqual,
} from "@/lib/crypto";

/**
 * Verify inbound-webhook authentication. Two methods are accepted:
 *  1. `Authorization: Bearer <secret>`
 *  2. `X-Webhook-Signature: sha256=<hmac>` — HMAC-SHA256 over the *raw*
 *     request body bytes, hex-encoded.
 *
 * Both comparisons are constant-time. A missing configured secret fails
 * closed: unauthenticated ingestion is never allowed.
 */
export async function verifyWebhookAuth(
  request: NextRequest,
  rawBody: string | Uint8Array<ArrayBuffer>,
  secret: string | null | undefined
): Promise<boolean> {
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    if (await timingSafeEqual(authHeader.slice(7), secret)) return true;
  }

  const signatureHeader = request.headers.get("x-webhook-signature");
  if (signatureHeader?.startsWith("sha256=")) {
    const provided = signatureHeader.slice(7).toLowerCase();
    const expected = await hmacSha256Hex(rawBody, secret);
    if (await timingSafeEqual(provided, expected)) return true;
  }

  return false;
}

const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Verify a Svix-signed webhook (used by Resend). The secret is the
 * dashboard-issued `whsec_…` value: the prefix is stripped and the remainder
 * base64-decoded into the HMAC key. The signed content is
 * `${svix-id}.${svix-timestamp}.${rawBody}`; `svix-signature` carries a
 * space-separated list of `v1,<base64>` signatures, any of which may match.
 * Timestamps outside ±5 minutes are rejected as replays.
 */
export async function verifySvixSignature(
  request: NextRequest,
  rawBody: string | Uint8Array<ArrayBuffer>,
  secret: string | null | undefined
): Promise<boolean> {
  if (!secret || !secret.startsWith("whsec_")) return false;

  const messageId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatureHeader = request.headers.get("svix-signature");
  if (!messageId || !timestamp || !signatureHeader) return false;

  const sentAt = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(nowSeconds - sentAt) > SVIX_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return false;
  }

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secret.slice("whsec_".length));
  } catch {
    return false;
  }

  const bodyText =
    typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  const expected = await hmacSha256Base64(
    `${messageId}.${timestamp}.${bodyText}`,
    keyBytes
  );
  for (const part of signatureHeader.split(" ")) {
    const separator = part.indexOf(",");
    const version = separator === -1 ? part : part.slice(0, separator);
    const signature = separator === -1 ? "" : part.slice(separator + 1);
    if (version === "v1" && signature) {
      if (await timingSafeEqual(signature, expected)) return true;
    }
  }
  return false;
}
