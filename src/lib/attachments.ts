import { attachments } from "@/drizzle/schema";
import { badRequest } from "@/lib/api/response";
import type { Database } from "@/lib/db";

/**
 * Inline reply images. Uploads are limited to common image formats verified
 * by magic bytes (SVG is never accepted because it can carry script), stored
 * in R2 under an unguessable key, and served publicly so outbound emails can
 * embed them.
 */

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_R2_PREFIX = "attachments/";

const SIGNATURES: Array<{ type: string; matches: (b: Uint8Array) => boolean }> = [
  {
    type: "image/png",
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: "image/jpeg",
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/gif",
    matches: (b) =>
      b.length > 6 &&
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  },
  {
    type: "image/webp",
    matches: (b) =>
      b.length > 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/**
 * Return the sniffed image type when it agrees with the declared type,
 * otherwise null. Declaring image/png over a JPEG (or an HTML file renamed
 * to .png) is rejected.
 */
export function sniffImageType(
  bytes: Uint8Array,
  declaredType: string
): string | null {
  const sniffed =
    SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? null;
  return sniffed && sniffed === declaredType ? sniffed : null;
}

export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}

export async function storeImageAttachment(
  db: Database,
  bucket: R2Bucket,
  input: { ticketId: string; file: File }
): Promise<{ id: string; url: string }> {
  const { ticketId, file } = input;
  if (file.size === 0) throw badRequest("Empty file");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw badRequest("Image exceeds the 5MB limit");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes, file.type);
  if (!contentType) {
    throw badRequest("Only PNG, JPEG, GIF, or WebP images are accepted");
  }
  const id = crypto.randomUUID().replace(/-/g, "");
  await bucket.put(`${ATTACHMENT_R2_PREFIX}${id}`, bytes, {
    httpMetadata: { contentType },
  });
  const safeName =
    (file.name || "image").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) ||
    "image";
  await db.insert(attachments).values({
    id,
    ticketId,
    fileName: safeName,
    contentType,
    sizeBytes: bytes.length,
    createdAt: new Date().toISOString(),
  });
  return { id, url: attachmentUrl(id) };
}
