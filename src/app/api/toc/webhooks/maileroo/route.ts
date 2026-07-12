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

const mailerooPayloadSchema = z
  .object({
    from: z.string().email().max(320),
    from_name: z.string().max(256).optional(),
    to: z.string().email().max(320),
    subject: z.string().min(1).max(998),
    text: z.string().max(500_000).optional(),
    html: z.string().max(1_000_000).optional(),
    message_id: z.string().max(998).optional(),
    in_reply_to: z.string().max(2_000).optional(),
    references: z.string().max(20_000).optional(),
    spam_score: z.number().optional(),
    spf: z.string().max(32).optional(),
    dkim: z.string().max(32).optional(),
  })
  .refine((p) => p.text || p.html, {
    message: "At least one of text or html is required",
  })
  .refine(
    (p) => (p.text?.length ?? 0) + (p.html?.length ?? 0) <= 1_500_000,
    { message: "Email content exceeds the 1.5 MB limit" }
  );

/**
 * POST /api/toc/webhooks/maileroo — Maileroo inbound email webhook.
 *
 * Authenticated with the same per-product webhook secret as the generic
 * endpoint (Bearer token or HMAC over the raw body). Configure the secret in
 * Maileroo's webhook settings.
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  await enforceRateLimit(db, req, "webhook:maileroo", {
    limit: 120,
    windowSeconds: 60,
  });

  const rawBody = await readBodyBytes(req, MAX_WEBHOOK_BODY_BYTES);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = mailerooPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return err("Validation failed", 400, z.flattenError(parsed.error));
  }
  const payload = parsed.data;

  const config = await db.query.emailConfigs.findFirst({
    where: sql`lower(${emailConfigs.inboundAddress}) = ${payload.to.toLowerCase()}`,
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
    provider: "maileroo",
    fromEmail: payload.from,
    fromName: payload.from_name,
    toEmail: payload.to,
    subject: payload.subject,
    bodyPlain: payload.text,
    bodyHtml: payload.html,
    messageId: payload.message_id,
    inReplyTo: payload.in_reply_to,
    references: payload.references,
    spfResult: payload.spf,
    dkimResult: payload.dkim === "pass",
    isSpam: payload.spam_score !== undefined && payload.spam_score > 5,
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
