import { eq } from "drizzle-orm";
import { productKeys } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { randomHex, sha256Hex, timingSafeEqual } from "@/lib/crypto";

/**
 * Product API keys are presented as `keyId.secret`. Only the SHA-256 hash of
 * the secret is persisted; the plaintext is shown exactly once on creation
 * or rotation.
 */

export interface GeneratedKey {
  id: string;
  /** Full plaintext credential (`id.secret`) — show once, never store. */
  plaintext: string;
  secretHash: string;
}

export async function generateProductKeySecret(): Promise<GeneratedKey> {
  const id = crypto.randomUUID();
  const secret = randomHex(32);
  return {
    id,
    plaintext: `${id}.${secret}`,
    secretHash: await sha256Hex(secret),
  };
}

export async function rotateProductKeySecret(
  keyId: string
): Promise<Omit<GeneratedKey, "id"> & { id: string }> {
  const secret = randomHex(32);
  return {
    id: keyId,
    plaintext: `${keyId}.${secret}`,
    secretHash: await sha256Hex(secret),
  };
}

export interface VerifiedKey {
  id: string;
  productId: string;
}

/**
 * Verify an `keyId.secret` credential against the stored hash.
 * Returns the key's product binding on success, null otherwise.
 */
export async function verifyProductApiKey(
  db: Database,
  apiKey: string
): Promise<VerifiedKey | null> {
  const dotIndex = apiKey.indexOf(".");
  if (dotIndex <= 0 || dotIndex === apiKey.length - 1) return null;
  const keyId = apiKey.slice(0, dotIndex);
  const secret = apiKey.slice(dotIndex + 1);

  const key = await db.query.productKeys.findFirst({
    where: eq(productKeys.id, keyId),
  });
  if (!key || key.revoked) return null;

  const candidateHash = await sha256Hex(secret);
  if (!(await timingSafeEqual(candidateHash, key.secretHash))) return null;

  return { id: key.id, productId: key.productId };
}
