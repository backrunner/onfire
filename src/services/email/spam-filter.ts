import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  spamFilterConfigs,
  type SpamFilterConfigRow,
  type SpamFilterVerdict,
} from "@/drizzle/schema";
import { getEnv } from "@/lib/db";
import { safePublicHttpUrl } from "@/lib/external-url";
import {
  SPAM_FILTER_PROTOCOL,
  spamFilterProviderDef,
  type SpamFilterProvider,
} from "@/lib/spam-filter-providers";
import { openStoredSecret, sealSecret } from "@/lib/secret-storage";
import { readResponseText } from "@/lib/response-body";

const MAX_RESPONSE_BYTES = 64 * 1024;
const CUSTOM_CONTENT_LIMIT = 100_000;
const VENDOR_CONTENT_LIMIT = 10_000;

const customResponseSchema = z
  .object({
    verdict: z.enum(["allow", "suspect", "spam"]),
    score: z.number().min(0).max(1).optional(),
    reason: z.string().max(1000).optional(),
    referenceId: z.string().max(500).optional(),
  })
  .strict();

const oopspamResponseSchema = z.object({
  Score: z.number(),
  Details: z
    .object({
      isContentSpam: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

const postmarkResponseSchema = z.object({
  success: z.boolean(),
  score: z.union([z.number(), z.string()]),
});

const stopForumSpamResponseSchema = z.object({
  success: z.union([z.literal(1), z.literal(0), z.boolean()]),
  email: z
    .object({
      appears: z.union([z.literal(1), z.literal(0), z.boolean()]).optional(),
      confidence: z.number().optional(),
      frequency: z.number().optional(),
    })
    .optional(),
});

export interface SpamFilterInput {
  messageId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  content: string;
  userIp?: string;
  spfResult?: string;
  dkimResult?: boolean;
  autoSubmitted?: string;
  precedence?: string;
  listId?: string;
  returnPath?: string;
}

export interface SpamFilterResult {
  verdict: SpamFilterVerdict;
  score?: number;
  reason?: string;
  referenceId?: string;
  provider: SpamFilterProvider;
}

export { SPAM_FILTER_PROTOCOL };

export function spamFilterSecretPurpose(scopeKey: string) {
  return `spam-filter:${scopeKey}:auth`;
}

export async function sealSpamFilterSecret(scopeKey: string, value: string) {
  return sealSecret(value, getEnv().AUTH_SECRET, spamFilterSecretPurpose(scopeKey));
}

async function openSpamFilterSecret(config: SpamFilterConfigRow) {
  return config.authSecret
    ? openStoredSecret(
        config.authSecret,
        getEnv().AUTH_SECRET,
        spamFilterSecretPurpose(config.scopeKey)
      )
    : null;
}

export async function resolveSpamFilterConfig(
  db: Database,
  tenantId: string
): Promise<SpamFilterConfigRow | null> {
  const tenant = await db.query.spamFilterConfigs.findFirst({
    where: eq(spamFilterConfigs.scopeKey, `tenant:${tenantId}`),
  });
  if (tenant?.mode === "disabled") return null;
  if (tenant?.mode === "custom") return tenant;
  const global = await db.query.spamFilterConfigs.findFirst({
    where: eq(spamFilterConfigs.scopeKey, "global"),
  });
  return global?.mode === "custom" ? global : null;
}

export async function runExternalSpamFilter(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  fetchImpl: typeof fetch = fetch
): Promise<SpamFilterResult> {
  const definition = spamFilterProviderDef(config.provider);
  const authSecret = await openSpamFilterSecret(config);
  switch (definition.id) {
    case "akismet":
      return runAkismet(config, input, authSecret, fetchImpl);
    case "oopspam":
      return runOopspam(config, input, authSecret, fetchImpl);
    case "postmark":
      return runPostmark(config, input, fetchImpl);
    case "stopforumspam":
      return runStopForumSpam(config, input, authSecret, fetchImpl);
    default:
      return runCustom(config, input, authSecret, fetchImpl);
  }
}

async function runCustom(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  authSecret: string | null,
  fetchImpl: typeof fetch
): Promise<SpamFilterResult> {
  const response = await requestSpamProvider(
    requirePublicUrl(config.endpointUrl, "Unsafe spam filter URL"),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-onfire-spam-protocol": SPAM_FILTER_PROTOCOL,
        ...(authSecret ? { authorization: `Bearer ${authSecret}` } : {}),
      },
      body: JSON.stringify({
        ...input,
        content: input.content.slice(0, CUSTOM_CONTENT_LIMIT),
      }),
    },
    config.timeoutMs,
    fetchImpl
  );
  requireJson(response);
  const parsed = customResponseSchema.parse(
    JSON.parse(await readResponseText(response, MAX_RESPONSE_BYTES)) as unknown
  );
  return { ...parsed, provider: "custom" };
}

async function runAkismet(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  authSecret: string | null,
  fetchImpl: typeof fetch
): Promise<SpamFilterResult> {
  if (!authSecret) throw new Error("Akismet API key is required");
  const blog = requirePublicUrl(config.endpointUrl, "A public HTTPS site URL is required");
  const body = new URLSearchParams({
    api_key: authSecret,
    blog,
    user_ip: input.userIp?.trim() || "0.0.0.0",
    user_agent: "OnFire/1.0",
    comment_type: "contact-form",
    comment_content: combinedContent(input, VENDOR_CONTENT_LIMIT),
    blog_charset: "UTF-8",
  });
  if (input.fromEmail) body.set("comment_author_email", input.fromEmail);
  const response = await requestSpamProvider(
    spamFilterProviderDef("akismet").requestUrl!,
    {
      method: "POST",
      headers: {
        accept: "text/plain",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
    config.timeoutMs,
    fetchImpl
  );
  const text = (await readResponseText(response, MAX_RESPONSE_BYTES)).trim().toLowerCase();
  if (text === "invalid") throw new Error("Akismet rejected the API key or site URL");
  if (text !== "true" && text !== "false") {
    throw new Error("Akismet returned an unexpected response");
  }
  const discard =
    response.headers.get("x-akismet-pro-tip")?.toLowerCase() === "discard";
  if (text === "true") {
    return {
      verdict: "spam",
      score: discard ? 1 : 0.9,
      reason: discard ? "Akismet marked the submission as blatant spam" : "Akismet classified the submission as spam",
      provider: "akismet",
    };
  }
  return { verdict: "allow", score: 0, provider: "akismet" };
}

async function runOopspam(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  authSecret: string | null,
  fetchImpl: typeof fetch
): Promise<SpamFilterResult> {
  if (!authSecret) throw new Error("OOPSpam API key is required");
  const payload: Record<string, unknown> = {
    content: combinedContent(input, VENDOR_CONTENT_LIMIT),
    checkForLength: false,
  };
  if (input.fromEmail) payload.email = input.fromEmail;
  if (input.userIp) payload.senderIP = input.userIp;
  const response = await requestSpamProvider(
    spamFilterProviderDef("oopspam").requestUrl!,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": authSecret,
      },
      body: JSON.stringify(payload),
    },
    config.timeoutMs,
    fetchImpl
  );
  requireJson(response);
  const parsed = oopspamResponseSchema.parse(
    JSON.parse(await readResponseText(response, MAX_RESPONSE_BYTES)) as unknown
  );
  const score = parsed.Score;
  const verdict: SpamFilterVerdict = score >= 5 ? "spam" : score >= 3 ? "suspect" : "allow";
  return {
    verdict,
    score: clamp01(score / 6),
    reason:
      parsed.Details?.isContentSpam === "spam"
        ? "OOPSpam marked the content as spam"
        : `OOPSpam score ${score}`,
    provider: "oopspam",
  };
}

async function runPostmark(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  fetchImpl: typeof fetch
): Promise<SpamFilterResult> {
  const rawEmail = [
    `From: ${input.fromEmail || "unknown@example.com"}`,
    `To: ${input.toEmail || "support@example.com"}`,
    `Subject: ${input.subject || "(no subject)"}`,
    `Message-ID: ${input.messageId || "<ticket@onfire>"}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.content.slice(0, VENDOR_CONTENT_LIMIT),
  ].join("\r\n");
  const response = await requestSpamProvider(
    spamFilterProviderDef("postmark").requestUrl!,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: rawEmail, options: "short" }),
    },
    config.timeoutMs,
    fetchImpl
  );
  requireJson(response);
  const parsed = postmarkResponseSchema.parse(
    JSON.parse(await readResponseText(response, MAX_RESPONSE_BYTES)) as unknown
  );
  if (!parsed.success) throw new Error("Postmark SpamCheck did not return a score");
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) throw new Error("Postmark SpamCheck returned an invalid score");
  const verdict: SpamFilterVerdict = score >= 5 ? "spam" : score >= 3 ? "suspect" : "allow";
  return {
    verdict,
    score: clamp01(score / 10),
    reason: `SpamAssassin score ${score}`,
    provider: "postmark",
  };
}

async function runStopForumSpam(
  config: SpamFilterConfigRow,
  input: SpamFilterInput,
  authSecret: string | null,
  fetchImpl: typeof fetch
): Promise<SpamFilterResult> {
  const email = input.fromEmail.trim();
  if (!email) {
    return { verdict: "allow", reason: "No sender email to look up", provider: "stopforumspam" };
  }
  const url = new URL(spamFilterProviderDef("stopforumspam").requestUrl!);
  url.searchParams.set("email", email);
  url.searchParams.set("json", "");
  if (authSecret) url.searchParams.set("api_key", authSecret);
  const response = await requestSpamProvider(
    url.toString(),
    { method: "GET", headers: { accept: "application/json" } },
    config.timeoutMs,
    fetchImpl
  );
  requireJson(response);
  const parsed = stopForumSpamResponseSchema.parse(
    JSON.parse(await readResponseText(response, MAX_RESPONSE_BYTES)) as unknown
  );
  if (parsed.success !== 1 && parsed.success !== true) {
    throw new Error("Stop Forum Spam lookup failed");
  }
  const appears = parsed.email?.appears === 1 || parsed.email?.appears === true;
  const confidence = parsed.email?.confidence ?? 0;
  if (!appears) return { verdict: "allow", score: 0, provider: "stopforumspam" };
  const verdict: SpamFilterVerdict =
    confidence >= 90 ? "spam" : confidence >= 40 ? "suspect" : "allow";
  return {
    verdict,
    score: clamp01(confidence / 100),
    reason: `Stop Forum Spam confidence ${confidence}`,
    provider: "stopforumspam",
  };
}

async function requestSpamProvider(
  rawUrl: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const endpoint = requirePublicUrl(rawUrl, "Unsafe spam filter URL");
  const url = new URL(endpoint);
  if (url.hash) throw new Error("Spam filter URL cannot include a fragment");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Spam filter redirects are not allowed");
    }
    if (!response.ok) throw new Error(`Spam filter failed (${response.status})`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function requirePublicUrl(value: string | null | undefined, message: string): string {
  const url = safePublicHttpUrl(value);
  if (!url) throw new Error(message);
  return url;
}

function requireJson(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new Error("Spam filter must return JSON");
  }
}

function combinedContent(input: SpamFilterInput, limit: number): string {
  return [input.subject, input.content].filter(Boolean).join("\n\n").slice(0, limit);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
