import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attachments } from "@/drizzle/schema";
import { getDb, getEnv } from "@/lib/db";
import { ATTACHMENT_R2_PREFIX } from "@/lib/attachments";

/**
 * GET /api/attachments/:id — public image serving.
 *
 * The id is a 128-bit random key, which keeps uploads unguessable while
 * allowing email clients (which send no credentials) to load inline images.
 * Responses are pinned to the stored image content type with nosniff and a
 * sandboxing CSP so a forged object cannot execute as a document.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-z0-9]{32}$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const row = await getDb().query.attachments.findFirst({
    where: eq(attachments.id, id),
  });
  if (!row) return new NextResponse("Not found", { status: 404 });

  const object = await getEnv().R2.get(`${ATTACHMENT_R2_PREFIX}${id}`);
  if (!object) return new NextResponse("Not found", { status: 404 });

  const filename = encodeURIComponent(row.fileName);
  return new NextResponse(object.body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.sizeBytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
    },
  });
}
