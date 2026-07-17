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
import { openStoredSecret, sealSecret } from "@/lib/secret-storage";
import { readResponseText } from "@/lib/response-body";

export const SPAM_FILTER_PROTOCOL = "onfire-spam-v1";
const MAX_RESPONSE_BYTES = 64 * 1024;

const responseSchema = z
  .object({
    verdict: z.enum(["allow", "suspect", "spam"]),
    score: z.number().min(0).max(1).optional(),
    reason: z.string().max(1000).optional(),
    referenceId: z.string().max(500).optional(),
  })
  .strict();

export interface SpamFilterInput {
  messageId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  content: string;
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
  provider: string;
}

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
  const endpoint = safePublicHttpUrl(config.endpointUrl);
  if (!endpoint) throw new Error("Unsafe spam filter URL");
  const url = new URL(endpoint);
  if (url.hash) throw new Error("Spam filter URL cannot include a fragment");
  const authSecret = await openSpamFilterSecret(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-onfire-spam-protocol": SPAM_FILTER_PROTOCOL,
        ...(authSecret ? { authorization: `Bearer ${authSecret}` } : {}),
      },
      body: JSON.stringify({
        ...input,
        content: input.content.slice(0, 100_000),
      }),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Spam filter redirects are not allowed");
    }
    if (!response.ok) throw new Error(`Spam filter failed (${response.status})`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new Error("Spam filter must return JSON");
    }
    const parsed = responseSchema.parse(
      JSON.parse(await readResponseText(response, MAX_RESPONSE_BYTES)) as unknown
    );
    return { ...parsed, provider: config.scopeKey };
  } finally {
    clearTimeout(timeout);
  }
}

