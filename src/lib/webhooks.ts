import type { NextRequest } from "next/server";
import { hmacSha256Hex, timingSafeEqual } from "@/lib/crypto";

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
