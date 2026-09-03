import { NextRequest } from "next/server";
import { z } from "zod";
import { inArray, sql } from "drizzle-orm";
import { emailConfigs } from "@/drizzle/schema";
import { ok, err } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";
import { verifySvixSignature } from "@/lib/webhooks";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";
import { parseMailboxHeader } from "@/lib/email-address";
import { getEnv } from "@/lib/db";
import { openEmailSecret } from "@/services/email/config-secrets";
import { processInboundEmail } from "@/services/email/inbound";

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;
const RECEIVING_API_TIMEOUT_MS = 8_000;

const receivedDataSchema = z.object({
  email_id: z.string().min(1).max(128),
  from: z.string().max(512),
  to: z.array(z.string().max(320)).min(1).max(100),
  subject: z.string().max(998).optional(),
  message_id: z.string().max(998).optional(),
});

const eventSchema = z.object({
  type: z.string().max(128),
  data: z.unknown(),
});

const receivingEmailSchema = z.object({
  id: z.string().max(128).optional(),
  from: z.string().max(512).optional(),
  to: z.array(z.string().max(320)).max(100).optional(),
  subject: z.string().max(998).nullish(),
  text: z.string().max(500_000).nullish(),
  html: z.string().max(1_000_000).nullish(),
  headers: z.record(z.string(), z.string().max(20_000)).optional(),
  message_id: z.string().max(998).nullish(),
});

/**
 * POST /api/toc/webhooks/resend — Resend inbound email webhook.
 *
 * Resend's `email.received` webhook carries metadata only; the body is
 * pulled from the receiving API with the product's Resend API key. Requests
 * are authenticated with the product's Svix signing secret (`whsec_…`).
 */
export const POST = withPublic(async (req: NextRequest, { db }) => {
  await enforceRateLimit(db, req, "webhook:resend", {
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

  const eventParsed = eventSchema.safeParse(parsedJson);
  if (!eventParsed.success) {
    return err("Validation failed", 400, z.flattenError(eventParsed.error));
  }
  // One endpoint may subscribe to several event types; only inbound mail is
  // actionable here, everything else is acknowledged and ignored.
  if (eventParsed.data.type !== "email.received") {
    return ok({ ignored: true, type: eventParsed.data.type });
  }

  const dataParsed = receivedDataSchema.safeParse(eventParsed.data.data);
  if (!dataParsed.success) {
    return err("Validation failed", 400, z.flattenError(dataParsed.error));
  }
  const data = dataParsed.data;

  const recipients = [...new Set(data.to.map((value) => value.trim().toLowerCase()))];
  const config = await db.query.emailConfigs.findFirst({
    where: inArray(sql`lower(${emailConfigs.inboundAddress})`, recipients),
  });
  if (!config) {
    return err("Unknown inbound address", 404);
  }

  const masterSecret = getEnv().AUTH_SECRET;
  const webhookSecret = config.inboundWebhookSecret
    ? await openEmailSecret(
        config.productId,
        "inboundWebhookSecret",
        config.inboundWebhookSecret,
        masterSecret
      )
    : null;
  const authenticated = await verifySvixSignature(req, rawBody, webhookSecret);
  if (!authenticated) {
    return err("Unauthorized", 401);
  }

  if (!config.inboundApiKey) {
    return err("Resend inbound API key is not configured", 500);
  }
  const apiKey = await openEmailSecret(
    config.productId,
    "inboundApiKey",
    config.inboundApiKey,
    masterSecret
  );

  let received: z.infer<typeof receivingEmailSchema>;
  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(data.email_id)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(RECEIVING_API_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      return err(`Resend receiving API failed (${response.status})`, 502);
    }
    const parsedBody = receivingEmailSchema.safeParse(await response.json());
    if (!parsedBody.success) {
      return err("Unexpected Resend receiving API payload", 502);
    }
    received = parsedBody.data;
  } catch {
    return err("Resend receiving API is unreachable", 502);
  }

  const bodyPlain = received.text?.trim() ? received.text : undefined;
  const bodyHtml = received.html?.trim() ? received.html : undefined;
  if (!bodyPlain && !bodyHtml) {
    return err("Received email has no content", 502);
  }

  const from = parseMailboxHeader(received.from ?? data.from);
  if (!from) {
    return err("Missing sender", 400);
  }
  const headers = received.headers ?? {};
  const subject =
    received.subject?.trim() || data.subject?.trim() || "(no subject)";

  const result = await processInboundEmail(db, {
    provider: "resend",
    fromEmail: from.email,
    fromName: from.name,
    toEmail: config.inboundAddress!,
    subject,
    bodyPlain,
    bodyHtml,
    messageId: received.message_id ?? data.message_id,
    inReplyTo: headers["in-reply-to"],
    references: headers["references"],
    autoSubmitted: headers["auto-submitted"],
    precedence: headers["precedence"],
    listId: headers["list-id"],
    returnPath: headers["return-path"],
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
