import { NextRequest } from "next/server";
import { z } from "zod";
import { inArray, sql } from "drizzle-orm";
import { emailConfigs } from "@/drizzle/schema";
import { ok, err } from "@/lib/api/response";
import { withPublic } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";
import { parseMailboxHeader } from "@/lib/email-address";
import { processInboundEmail } from "@/services/email/inbound";

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;
const VALIDATION_URL_HOST = "inbound-api.maileroo.net";
const VALIDATION_TIMEOUT_MS = 5_000;

const headerValues = z.array(z.string().max(20_000)).max(50);

const mailerooPayloadSchema = z
  .object({
    _id: z.string().max(128).optional(),
    message_id: z.string().max(998).optional(),
    envelope_sender: z.string().max(320).optional(),
    recipients: z.array(z.string().max(320)).max(100).optional(),
    headers: z.record(z.string(), headerValues).optional(),
    body: z.object({
      plaintext: z.string().max(500_000).nullish(),
      stripped_plaintext: z.string().max(500_000).nullish(),
      html: z.string().max(1_000_000).nullish(),
      stripped_html: z.string().max(1_000_000).nullish(),
    }),
    spf_result: z.string().max(32).optional(),
    dkim_result: z.boolean().optional(),
    is_spam: z.boolean().optional(),
    validation_url: z.string().max(2_000).optional(),
  })
  .refine(
    (p) =>
      p.body.stripped_plaintext?.trim() ||
      p.body.plaintext?.trim() ||
      p.body.stripped_html?.trim() ||
      p.body.html?.trim(),
    { message: "At least one plaintext or html body part is required" }
  )
  .refine(
    (p) =>
      (p.body.stripped_plaintext?.length ?? p.body.plaintext?.length ?? 0) +
        (p.body.stripped_html?.length ?? p.body.html?.length ?? 0) <=
      1_500_000,
    { message: "Email content exceeds the 1.5 MB limit" }
  );

/** Maileroo strips quoted history; fall back to the full part when empty. */
function pickBodyPart(
  stripped: string | null | undefined,
  full: string | null | undefined
): string | undefined {
  if (stripped?.trim()) return stripped;
  return full ?? undefined;
}

/** Case-insensitive lookup into the Title-Case header map Maileroo sends. */
function headerValue(
  headers: Record<string, string[]> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name
  );
  return key ? headers[key][0] : undefined;
}

/**
 * Maileroo cannot send custom headers or shared secrets. The only forgery
 * check is the one-shot validation URL: it must point at Maileroo's own
 * inbound API (anything else would turn this endpoint into an SSRF relay)
 * and it is consumed exactly once — never retried.
 */
async function validateMailerooCallback(rawUrl: string | undefined): Promise<boolean> {
  if (!rawUrl) return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== VALIDATION_URL_HOST) {
    return false;
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return (
      typeof result === "object" &&
      result !== null &&
      (result as { success?: unknown }).success === true
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/toc/webhooks/maileroo — Maileroo Inbound Routing webhook.
 *
 * Authenticated exclusively through the one-shot `validation_url` callback
 * (see validateMailerooCallback); Maileroo retries non-200 responses, so a
 * successfully processed message always returns 200.
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

  // The To header may carry a comma-separated mailbox list.
  const headerTo = (headerValue(payload.headers, "to") ?? "")
    .split(",")
    .map((value) => parseMailboxHeader(value)?.email);
  const candidates = [
    ...(payload.recipients ?? []).map(
      (value) => parseMailboxHeader(value)?.email ?? value.trim().toLowerCase()
    ),
    ...headerTo,
  ].filter((value): value is string => Boolean(value));
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 0) {
    return err("Unknown inbound address", 404);
  }
  const config = await db.query.emailConfigs.findFirst({
    where: inArray(
      sql`lower(${emailConfigs.inboundAddress})`,
      uniqueCandidates
    ),
  });
  if (!config) {
    return err("Unknown inbound address", 404);
  }

  if (!(await validateMailerooCallback(payload.validation_url))) {
    return err("Unauthorized", 401);
  }

  const headerFrom = parseMailboxHeader(headerValue(payload.headers, "from"));
  const envelopeFrom = parseMailboxHeader(payload.envelope_sender);
  const from = headerFrom ?? envelopeFrom;
  if (!from) {
    return err("Missing sender", 400);
  }
  const subject =
    headerValue(payload.headers, "subject")?.trim() || "(no subject)";

  const result = await processInboundEmail(db, {
    provider: "maileroo",
    fromEmail: from.email,
    fromName: from.name,
    toEmail: config.inboundAddress!,
    subject,
    bodyPlain: pickBodyPart(
      payload.body.stripped_plaintext,
      payload.body.plaintext
    ),
    bodyHtml: pickBodyPart(payload.body.stripped_html, payload.body.html),
    messageId:
      payload.message_id ?? headerValue(payload.headers, "message-id"),
    inReplyTo: headerValue(payload.headers, "in-reply-to"),
    references: headerValue(payload.headers, "references"),
    spfResult: payload.spf_result,
    dkimResult: payload.dkim_result,
    isSpam: payload.is_spam,
    // The envelope sender is transport-verified; keep it for bounce checks.
    returnPath: envelopeFrom?.email,
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
