import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { emailConfigs } from "@/drizzle/schema";
import { ok, err } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";
import { verifyWebhookAuth } from "@/lib/webhooks";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";
import { processInboundEmail } from "@/services/email/inbound";
import { getEnv } from "@/lib/db";
import { openEmailSecret } from "@/services/email/config-secrets";

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

const inboundPayloadSchema = z
  .object({
    from_email: z.string().email().max(320),
    to_email: z.string().email().max(320),
    subject: z.string().min(1).max(998),
    body_plain: z.string().max(500_000).optional(),
    body_html: z.string().max(1_000_000).optional(),
    from_name: z.string().max(256).optional(),
    message_id: z.string().max(998).optional(),
    in_reply_to: z.string().max(2_000).optional(),
    references: z.string().max(20_000).optional(),
    spf_result: z.string().max(32).optional(),
    dkim_result: z.boolean().optional(),
    is_spam: z.boolean().optional(),
  })
  .refine((p) => p.body_plain || p.body_html, {
    message: "At least one of body_plain or body_html is required",
  })
  .refine(
    (p) => (p.body_plain?.length ?? 0) + (p.body_html?.length ?? 0) <= 1_500_000,
    { message: "Email content exceeds the 1.5 MB limit" }
  );

/**
 * POST /api/toc/webhooks/inbound — generic inbound email webhook.
 *
 * Authentication is mandatory: Bearer secret or HMAC signature over the raw
 * body (X-Webhook-Signature: sha256=<hex>). The secret is configured per
 * product via the admin email settings.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  await enforceRateLimit(db, req, "webhook:inbound", {
    limit: 120,
    windowSeconds: 60,
  });

  // Read raw bytes first — the HMAC covers the body exactly as transmitted.
  const rawBody = await readBodyBytes(req, MAX_WEBHOOK_BODY_BYTES);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = inboundPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return err("Validation failed", 400, z.flattenError(parsed.error));
  }
  const body = parsed.data;

  const config = await db.query.emailConfigs.findFirst({
    where: sql`lower(${emailConfigs.inboundAddress}) = ${body.to_email.toLowerCase()}`,
  });
  if (!config) {
    return err("Unknown inbound address", 404);
  }

  const webhookSecret = config.inboundWebhookSecret
    ? await openEmailSecret(
        config.productId,
        "inboundWebhookSecret",
        config.inboundWebhookSecret,
        getEnv().AUTH_SECRET
      )
    : null;
  const authenticated = await verifyWebhookAuth(req, rawBody, webhookSecret);
  if (!authenticated) {
    return err("Unauthorized", 401);
  }

  const result = await processInboundEmail(db, {
    provider: "generic",
    fromEmail: body.from_email,
    fromName: body.from_name,
    toEmail: body.to_email,
    subject: body.subject,
    bodyPlain: body.body_plain,
    bodyHtml: body.body_html,
    messageId: body.message_id,
    inReplyTo: body.in_reply_to,
    references: body.references,
    spfResult: body.spf_result,
    dkimResult: body.dkim_result,
    isSpam: body.is_spam,
  });

  if (!result.success && result.action === "error") {
    return err(result.reason ?? "Processing failed", 500);
  }

  return ok({
    action: result.action,
    ticketId: result.ticketId,
    replyId: result.replyId,
    reason: result.reason,
  });
});
