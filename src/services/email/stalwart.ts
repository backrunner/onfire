import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import PostalMime from "postal-mime";
import { z } from "zod";
import { emailConfigs, inboundEmails } from "@/drizzle/schema";
import { type Database, getEnv } from "@/lib/db";
import { ApiError } from "@/lib/api/response";
import { hmacSha256Base64, sha256Hex, timingSafeEqual } from "@/lib/crypto";
import { openEmailSecret } from "./config-secrets";
import { processInboundEmail, type InboundEmailPayload } from "./inbound";

export const MAX_STALWART_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const address = z.string().trim().toLowerCase().pipe(z.email().max(320));
// Stalwart forwards raw folded header values. Only continuation lines may
// contain newlines; a header value must never inject another MIME header.
const header = z.tuple([
  z.string().regex(/^[!-9;-~]+$/).max(256),
  z.string().max(32_000).refine((v) => !/\r(?!\n)|\n(?![ \t]|$)/.test(v)),
]);
export const stalwartHookSchema = z.object({
  context: z.object({
    stage: z.string().toLowerCase().pipe(z.enum(["connect", "ehlo", "auth", "mail", "rcpt", "data"])),
    protocol: z.object({ version: z.union([z.literal(1), z.literal("1.0")]) }).optional(),
  }),
  envelope: z.object({
    from: z.object({ address: z.union([address, z.literal("")]) }),
    to: z.array(z.object({ address })).max(1000),
  }).nullish(),
  message: z.object({
    headers: z.array(header).max(1000),
    serverHeaders: z.array(header).max(1000).default([]),
    contents: z.string().max(MAX_MESSAGE_BYTES),
    size: z.number().int().nonnegative().max(MAX_MESSAGE_BYTES),
  }).nullish(),
});

/** Product-scoped credentials authorize only this product's inbound address. */
export async function authenticateStalwart(
  db: Database,
  req: NextRequest,
  productId: string,
  rawBody?: Uint8Array<ArrayBuffer>,
) {
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });
  if (!config || config.inboundProvider !== "stalwart" || !config.inboundWebhookSecret) {
    throw new ApiError(401, "Unauthorized");
  }
  const secret = await openEmailSecret(
    productId, "inboundWebhookSecret", config.inboundWebhookSecret, getEnv().AUTH_SECRET,
  );
  if (!secret) throw new ApiError(401, "Unauthorized");
  const authorization = req.headers.get("authorization");
  let authenticated = authorization?.startsWith("Bearer ") &&
    await timingSafeEqual(authorization.slice(7), secret);
  // Native telemetry signature: raw UTF-8 key, HMAC-SHA256, standard Base64.
  // MTA Hooks use Bearer authentication, not telemetry's signature protocol.
  if (!authenticated && rawBody) {
    const signature = req.headers.get("x-signature");
    authenticated = Boolean(signature) && await timingSafeEqual(
      signature!, await hmacSha256Base64(rawBody, new TextEncoder().encode(secret)),
    );
  }
  if (!authenticated) throw new ApiError(401, "Unauthorized");
  if (!config.inboundEnabled || !config.inboundAddress) {
    throw new ApiError(409, "Stalwart inbound email is disabled or has no address");
  }
  return config;
}

export async function normalizeStalwartHook(
  hook: z.infer<typeof stalwartHookSchema>,
  toEmail: string,
): Promise<InboundEmailPayload | null> {
  if (hook.context.stage !== "data") return null;
  if (!hook.envelope || !hook.message) {
    throw new ApiError(400, "DATA stage requires envelope and message");
  }
  if (!hook.envelope.to.some((to) => to.address === toEmail.toLowerCase())) return null;
  // Delivery status notifications are not customer support requests.
  if (!hook.envelope.from.address) return null;

  const { headers, serverHeaders, contents } = hook.message;
  const headerValue = (name: string, source = headers) => source
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value.replace(/\r?\n[ \t]+/g, " ").trim())
    .join(" ") || undefined;
  const raw = headers.map(([key, value]) => `${key}: ${value.trimEnd()}\r\n`).join("") +
    `\r\n${contents}`;
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    throw new ApiError(413, "Message exceeds the 10 MiB inbound limit");
  }
  let parsed;
  try {
    parsed = await PostalMime.parse(raw);
  } catch {
    throw new ApiError(400, "Message could not be parsed");
  }
  if ((parsed.text?.length ?? 0) > 500_000 || (parsed.html?.length ?? 0) > 1_000_000) {
    throw new ApiError(413, "Decoded email content exceeds the inbound limit");
  }
  // Never trust an Authentication-Results or spam header supplied by a sender.
  // Some Stalwart versions send no serverHeaders; verdicts stay unknown then.
  const auth = headerValue("authentication-results", serverHeaders)?.toLowerCase();
  const dkim = [...(auth?.matchAll(/\bdkim=([a-z]+)/g) ?? [])].map((match) => match[1]);
  return {
    provider: "stalwart",
    fromEmail: hook.envelope.from.address,
    fromName: parsed.from?.name?.slice(0, 256),
    toEmail,
    subject: parsed.subject || "(no subject)",
    bodyPlain: parsed.text || undefined,
    bodyHtml: parsed.html || undefined,
    // The content-derived fallback survives SMTP retries with a new queue ID.
    messageId: parsed.messageId || `<stalwart-${await sha256Hex(
      `${hook.envelope.from.address}\n${toEmail}\n${raw}`,
    )}@onfire.invalid>`,
    inReplyTo: headerValue("in-reply-to")?.slice(0, 2_000),
    references: headerValue("references")?.slice(0, 20_000),
    autoSubmitted: headerValue("auto-submitted"),
    precedence: headerValue("precedence"),
    listId: headerValue("list-id"),
    returnPath: hook.envelope.from.address,
    spfResult: auth?.match(/\bspf=([a-z]+)/)?.[1],
    dkimResult: dkim.length ? dkim.includes("pass") : undefined,
    isSpam: /^yes\b/i.test(headerValue("x-spam-status", serverHeaders) ?? ""),
  };
}

export async function processStalwartEmail(
  db: Database, productId: string, payload: InboundEmailPayload,
) {
  const result = await processInboundEmail(db, payload, productId);
  if (result.action === "error" || result.action === "rejected") {
    throw new ApiError(503, "Inbound email processing failed; retry delivery");
  }
  if (result.action === "duplicate") {
    const existing = await db.query.inboundEmails.findFirst({
      where: and(
        eq(inboundEmails.productId, productId),
        eq(inboundEmails.messageId, payload.messageId!.trim().slice(0, 998)),
      ),
    });
    // A concurrent request holding the row is not yet a durable success.
    if (!existing || !["processed", "quarantined"].includes(existing.processingStatus)) {
      throw new ApiError(503, "Inbound email is still processing; retry delivery");
    }
  }
  return result;
}
