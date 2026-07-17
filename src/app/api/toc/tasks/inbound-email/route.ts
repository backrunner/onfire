import { NextRequest } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/db";
import { ok, err, ApiError } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";
import { readBodyBytes } from "@/lib/request-body";
import { timingSafeEqual } from "@/lib/crypto";
import { processInboundEmail } from "@/services/email/inbound";

const payloadSchema = z.object({
  provider: z.literal("cloudflare"),
  fromEmail: z.string().email().max(320),
  fromName: z.string().max(256).optional(),
  toEmail: z.string().email().max(320),
  subject: z.string().max(2_000),
  bodyPlain: z.string().max(10 * 1024 * 1024).optional(),
  bodyHtml: z.string().max(10 * 1024 * 1024).optional(),
  messageId: z.string().max(998).optional(),
  inReplyTo: z.string().max(2_000).optional(),
  references: z.string().max(20_000).optional(),
  spfResult: z.string().optional(),
  dkimResult: z.boolean().optional(),
  autoSubmitted: z.string().max(256).optional(),
  precedence: z.string().max(256).optional(),
  listId: z.string().max(998).optional(),
  returnPath: z.string().max(998).optional(),
});

/**
 * POST /api/toc/tasks/inbound-email — internal endpoint for the worker's
 * Cloudflare Email Routing handler.
 *
 * The worker `email()` handler parses the raw MIME message and forwards it
 * here through the WORKER_SELF_REFERENCE service binding (authenticated with
 * the deployment's AUTH_SECRET) so processing runs inside a normal request
 * context. The payload then flows through the same pipeline as the inbound
 * webhooks: security check → spam check → reply detection → AI filter.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  const env = getEnv();
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.AUTH_SECRET}`;
  if (!env.AUTH_SECRET || !(await timingSafeEqual(authHeader, expected))) {
    return err("Unauthorized", 401);
  }

  let raw: unknown;
  try {
    const bytes = await readBodyBytes(req, 16 * 1024 * 1024);
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return err("Invalid JSON body", 400);
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return err("Validation failed", 400, z.flattenError(parsed.error));
  }
  const payload = parsed.data;

  if (!payload.bodyPlain && !payload.bodyHtml) {
    return err("Either bodyPlain or bodyHtml is required", 400);
  }
  if ((payload.bodyPlain?.length ?? 0) + (payload.bodyHtml?.length ?? 0) > 12 * 1024 * 1024) {
    return err("Email content exceeds the 12 MB limit", 413);
  }

  const result = await processInboundEmail(db, payload);
  if (result.action === "error") {
    return err(result.reason ?? "Inbound email processing failed", 503);
  }
  return ok(result);
});
