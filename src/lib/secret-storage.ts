const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(masterSecret: string, purpose: string): Promise<CryptoKey> {
  if (!masterSecret) throw new Error("Master secret is not configured");
  if (!purpose) throw new Error("Secret purpose is required");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`onfire:${purpose}:${masterSecret}`)
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Seal a configuration secret for storage in D1. */
export async function sealSecret(
  plaintext: string,
  masterSecret: string,
  purpose: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterSecret, purpose);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    key,
    encoder.encode(plaintext)
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(ciphertext)
  )}`;
}

/** Open a D1 configuration secret. Invalid or rotated values fail closed. */
export async function openSecret(
  sealed: string,
  masterSecret: string,
  purpose: string
): Promise<string> {
  const [version, encodedIv, encodedCiphertext, ...rest] = sealed.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || rest.length > 0) {
    throw new Error("Invalid sealed secret");
  }
  const iv = base64UrlToBytes(encodedIv);
  if (iv.byteLength !== 12) throw new Error("Invalid sealed secret");
  const key = await deriveKey(masterSecret, purpose);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    key,
    base64UrlToBytes(encodedCiphertext)
  );
  return decoder.decode(plaintext);
}

export function isSealedSecret(value: string): boolean {
  return value.startsWith("v1.");
}

/**
 * Open a stored secret while retaining compatibility with pre-encryption
 * rows. Every new write is sealed; legacy plaintext is migrated when the
 * corresponding configuration is next saved.
 */
export async function openStoredSecret(
  stored: string,
  masterSecret: string,
  purpose: string
): Promise<string> {
  return isSealedSecret(stored)
    ? openSecret(stored, masterSecret, purpose)
    : stored;
}
