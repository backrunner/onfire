import { z } from "zod";
import type { NotificationEndpointRow } from "@/drizzle/schema";
import {
  isSealedSecret,
  openStoredSecret,
  sealSecret,
} from "@/lib/secret-storage";
import { safePublicHttpUrl } from "@/lib/external-url";
import {
  CHANNEL_SECRET_KEYS,
  CHANNEL_TYPES,
  TRIGGER_EVENTS,
} from "./channel-definitions";

export { CHANNEL_SECRET_KEYS, CHANNEL_TYPES, TRIGGER_EVENTS };

type ChannelType = (typeof CHANNEL_TYPES)[number];

export const channelTypeSchema = z.enum(CHANNEL_TYPES);
export const triggerEventsSchema = z.array(z.enum(TRIGGER_EVENTS)).min(1);

const sealedSecretPattern = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Secret fields accept both legacy plaintext and the sealed representation
 * used by new writes. This lets an edit validate an existing row without
 * exposing or decrypting its credentials in the request handler.
 */
const secretSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine(
    (value) => !isSealedSecret(value) || sealedSecretPattern.test(value),
    "Invalid sealed secret"
  );

const secretUrlSchema = secretSchema.refine(
  (value) => isSealedSecret(value) || safePublicHttpUrl(value) !== null,
  "A public HTTPS URL is required"
);

const serverUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    const normalized = safePublicHttpUrl(value);
    if (!normalized) return false;
    const url = new URL(normalized);
    return !url.search && !url.hash;
  }, "A public HTTPS URL without query or fragment is required")
  .optional();

const channelConfigSchemas = {
  email: z
    .object({ email: z.string().trim().email().max(320) })
    .passthrough(),
  pushdeer: z
    .object({
      pushkey: secretSchema,
      serverUrl: serverUrlSchema,
    })
    .passthrough(),
  bark: z
    .object({
      deviceKey: secretSchema,
      serverUrl: serverUrlSchema,
    })
    .passthrough(),
  ntfy: z
    .object({
      topic: z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9._:-]+$/),
      serverUrl: serverUrlSchema,
    })
    .passthrough(),
  telegram: z
    .object({
      botToken: secretSchema,
      chatId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_:@-]+$/),
    })
    .passthrough(),
  discord: z
    .object({ webhookUrl: secretUrlSchema })
    .passthrough(),
  slack: z.object({ webhookUrl: secretUrlSchema }).passthrough(),
  teams: z.object({ webhookUrl: secretUrlSchema }).passthrough(),
  feishu: z
    .object({ webhookUrl: secretUrlSchema, signingSecret: secretSchema.optional() })
    .passthrough(),
  dingtalk: z
    .object({ webhookUrl: secretUrlSchema, signingSecret: secretSchema.optional() })
    .passthrough(),
  wecom: z.object({ webhookUrl: secretUrlSchema }).passthrough(),
} satisfies Record<(typeof CHANNEL_TYPES)[number], z.ZodType>;

/** Return user-safe validation messages for provider-specific config. */
export function validateChannelConfig(
  channelType: string,
  config: unknown
): string[] {
  const schema = channelConfigSchemas[channelType as ChannelType];
  if (!schema) return [`Unsupported notification channel: ${channelType}`];
  const result = schema.safeParse(config);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

export function endpointSecretPurpose(endpointId: string, key: string): string {
  return `notification-endpoint:${endpointId}:${key}`;
}

export async function sealEndpointConfig(
  endpointId: string,
  config: Record<string, unknown>,
  masterSecret: string
): Promise<Record<string, unknown>> {
  const result = { ...config };
  for (const key of CHANNEL_SECRET_KEYS) {
    const value = config[key];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      !isSealedSecret(value)
    ) {
      result[key] = await sealSecret(
        value,
        masterSecret,
        endpointSecretPurpose(endpointId, key)
      );
    }
  }
  return result;
}

export async function openEndpointConfig(
  endpointId: string,
  config: Record<string, unknown>,
  masterSecret: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "string") continue;
    result[key] = CHANNEL_SECRET_KEYS.includes(
      key as (typeof CHANNEL_SECRET_KEYS)[number]
    )
      ? await openStoredSecret(
          value,
          masterSecret,
          endpointSecretPurpose(endpointId, key)
        )
      : value;
  }
  return result;
}

export function toEndpointView(row: NotificationEndpointRow) {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config || "{}");
  } catch {
    /* keep empty */
  }
  const secretFields: string[] = [];
  for (const key of CHANNEL_SECRET_KEYS) {
    if (typeof config[key] === "string" && config[key].length > 0) {
      secretFields.push(key);
      delete config[key];
    }
  }
  return { ...row, config, secretFields };
}
