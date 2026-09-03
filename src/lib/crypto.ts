const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bufferToHex(digest);
}

export async function hmacSha256Hex(
  message: string | Uint8Array<ArrayBuffer>,
  secret: string
): Promise<string> {
  const signature = await hmacSha256(message, encoder.encode(secret));
  return bufferToHex(signature);
}

/** HMAC-SHA256 with raw key bytes, base64-encoded (Svix-style signatures). */
export async function hmacSha256Base64(
  message: string | Uint8Array<ArrayBuffer>,
  keyBytes: Uint8Array<ArrayBuffer>
): Promise<string> {
  const signature = await hmacSha256(message, keyBytes);
  let binary = "";
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacSha256(
  message: string | Uint8Array<ArrayBuffer>,
  keyBytes: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign(
    "HMAC",
    key,
    typeof message === "string" ? encoder.encode(message) : message
  );
}

/** Hash both inputs to a fixed length before comparing to avoid length leaks. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const aBytes = new Uint8Array(aDigest);
  const bBytes = new Uint8Array(bDigest);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
