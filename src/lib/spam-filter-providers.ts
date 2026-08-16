export const SPAM_FILTER_PROVIDERS = [
  "postmark",
  "akismet",
  "oopspam",
  "stopforumspam",
  "custom",
] as const;

export type SpamFilterProvider = (typeof SPAM_FILTER_PROVIDERS)[number];

export const SPAM_FILTER_PROTOCOL = "onfire-spam-v1";

export interface SpamFilterProviderDefinition {
  id: SpamFilterProvider;
  requestUrl: string | null;
  requiresSecret: boolean;
  secretOptional: boolean;
  requiresEndpoint: boolean;
  endpointKind: "classifier" | "site" | null;
  docsUrl: string | null;
}

export const SPAM_FILTER_PROVIDER_DEFS: Record<
  SpamFilterProvider,
  SpamFilterProviderDefinition
> = {
  postmark: {
    id: "postmark",
    requestUrl: "https://spamcheck.postmarkapp.com/filter",
    requiresSecret: false,
    secretOptional: false,
    requiresEndpoint: false,
    endpointKind: null,
    docsUrl: "https://spamcheck.postmarkapp.com/doc/",
  },
  akismet: {
    id: "akismet",
    requestUrl: "https://rest.akismet.com/1.1/comment-check",
    requiresSecret: true,
    secretOptional: false,
    requiresEndpoint: true,
    endpointKind: "site",
    docsUrl: "https://akismet.com/developers/detailed-docs/comment-check/",
  },
  oopspam: {
    id: "oopspam",
    requestUrl: "https://api.oopspam.com/v1/spamdetection",
    requiresSecret: true,
    secretOptional: false,
    requiresEndpoint: false,
    endpointKind: null,
    docsUrl: "https://www.oopspam.com/docs/",
  },
  stopforumspam: {
    id: "stopforumspam",
    requestUrl: "https://api.stopforumspam.org/api",
    requiresSecret: false,
    secretOptional: true,
    requiresEndpoint: false,
    endpointKind: null,
    docsUrl: "https://www.stopforumspam.com/usage",
  },
  custom: {
    id: "custom",
    requestUrl: null,
    requiresSecret: true,
    secretOptional: false,
    requiresEndpoint: true,
    endpointKind: "classifier",
    docsUrl: null,
  },
};

export const SPAM_FILTER_CUSTOM_HEADERS_EXAMPLE = {
  "content-type": "application/json",
  accept: "application/json",
  "x-onfire-spam-protocol": SPAM_FILTER_PROTOCOL,
  authorization: "Bearer <secret>",
} as const;

export const SPAM_FILTER_CUSTOM_REQUEST_EXAMPLE = {
  messageId: "<ticket-123@onfire>",
  fromEmail: "customer@example.com",
  toEmail: "support@example.com",
  subject: "Cannot sign in",
  content: "I cannot access my account after the last update.",
  spfResult: "pass",
  dkimResult: true,
} as const;

export const SPAM_FILTER_CUSTOM_RESPONSE_EXAMPLE = {
  verdict: "spam",
  score: 0.92,
  reason: "Known promotional content",
  referenceId: "cls_123",
} as const;

export function isSpamFilterProvider(
  value: string | null | undefined
): value is SpamFilterProvider {
  return SPAM_FILTER_PROVIDERS.includes(value as SpamFilterProvider);
}

export function normalizeSpamFilterProvider(
  value: string | null | undefined
): SpamFilterProvider {
  return isSpamFilterProvider(value) ? value : "custom";
}

export function spamFilterProviderDef(
  value: string | null | undefined
): SpamFilterProviderDefinition {
  return SPAM_FILTER_PROVIDER_DEFS[normalizeSpamFilterProvider(value)];
}
