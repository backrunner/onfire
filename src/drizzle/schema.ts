import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";

// ============================================
// Better Auth Tables (required for authentication)
// ============================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    verified: integer("verified", { mode: "boolean" }).notNull().default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp" }),
  },
  (t) => [
    index("two_factor_secret_idx").on(t.secret),
    index("two_factor_user_idx").on(t.userId),
  ],
);

export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: integer("created_at", { mode: "timestamp" }),
    aaguid: text("aaguid"),
  },
  (t) => [
    index("passkey_user_idx").on(t.userId),
    uniqueIndex("passkey_credential_id_unique").on(t.credentialID),
  ],
);

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ============================================
// Application Tables
// ============================================

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultTeamId: text("default_team_id"),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  /** Product homepage used as the customer portal fallback destination. */
  homepageUrl: text("homepage_url"),
  /** Optional deep link preferred when a customer session expires. */
  portalReturnUrl: text("portal_return_url"),
  slaHighAccept: integer("sla_high_accept"),
  slaHighReply: integer("sla_high_reply"),
  slaMediumAccept: integer("sla_medium_accept"),
  slaMediumReply: integer("sla_medium_reply"),
  slaLowAccept: integer("sla_low_accept"),
  slaLowReply: integer("sla_low_reply"),
  // Auto-close settings: minutes of customer inactivity before auto-closing
  autoCloseMinutes: integer("auto_close_minutes"),
});

/**
 * Server-to-server customer identity resolution for a product. The browser
 * presents only a short-lived opaque credential; OnFire exchanges it with
 * this endpoint and never exposes the configured resolver secret.
 */
export const productIdentityConfigs = sqliteTable("product_identity_configs", {
  productId: text("product_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  endpointUrl: text("endpoint_url"),
  /** AES-GCM sealed with AUTH_SECRET; plaintext is never persisted. */
  authSecret: text("auth_secret"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    productId: text("product_id").notNull(),
    /**
     * Optional — OnFire can operate without knowing the business product's
     * user PII; `externalId` is then the correlation key.
     */
    email: text("email"),
    externalId: text("external_id"),
    level: integer("level"),
    meta: text("meta"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("customers_product_email_uq").on(t.productId, t.email),
    uniqueIndex("customers_product_external_uq").on(t.productId, t.externalId),
    index("customers_tenant_idx").on(t.tenantId),
  ],
);

export const productKeys = sqliteTable(
  "product_keys",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    name: text("name"),
    // SHA-256 hex of the key secret; plaintext is never persisted
    secretHash: text("secret").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    revoked: integer("revoked", { mode: "boolean" }).default(false),
  },
  (t) => [index("product_keys_product_idx").on(t.productId)],
);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  allowReassign: integer("allow_reassign", { mode: "boolean" }).default(true),
});

export const productTeams = sqliteTable(
  "product_teams",
  {
    productId: text("product_id").notNull(),
    teamId: text("team_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.teamId] })],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").$type<Role>().notNull(),
  },
  (t) => [index("users_tenant_idx").on(t.tenantId)],
);

export const agents = sqliteTable("agents", {
  userId: text("user_id").primaryKey(),
  level: integer("level").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const agentTeams = sqliteTable(
  "agent_teams",
  {
    userId: text("user_id").notNull(),
    teamId: text("team_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.teamId] }),
    index("agent_teams_team_idx").on(t.teamId),
  ],
);

/** Product administration scope, independent from support-agent membership. */
export const userProducts = sqliteTable(
  "user_products",
  {
    userId: text("user_id").notNull(),
    productId: text("product_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productId] }),
    index("user_products_product_idx").on(t.productId),
  ],
);

export const agentProfiles = sqliteTable("agent_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
});

export type TicketTypeSystemKey = "unclassified" | `legacy:${string}`;

/** Product-owned ticket taxonomy. Parent chains are validated to a maximum depth of three. */
export const ticketTypes = sqliteTable(
  "ticket_types",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    parentId: text("parent_id"),
    level: integer("level").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    systemKey: text("system_key").$type<TicketTypeSystemKey>(),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("ticket_types_product_parent_idx").on(t.productId, t.parentId),
    uniqueIndex("ticket_types_product_system_uq").on(t.productId, t.systemKey),
  ],
);

export type TicketInternalStateKind = "boolean" | "select";

/** Tenant-owned reusable ticket-type trees. Applying a preset copies its subtree. */
export const ticketTypePresets = sqliteTable(
  "ticket_type_presets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    parentId: text("parent_id"),
    level: integer("level").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("ticket_type_presets_tenant_parent_idx").on(t.tenantId, t.parentId),
  ],
);

/** Product-owned internal state definitions for one exact ticket type. */
export const ticketTypeInternalStates = sqliteTable(
  "ticket_type_internal_states",
  {
    id: text("id").primaryKey(),
    ticketTypeId: text("ticket_type_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").$type<TicketInternalStateKind>().notNull(),
    options: text("options"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("ticket_type_internal_states_type_idx").on(t.ticketTypeId),
    uniqueIndex("ticket_type_internal_states_name_uq").on(
      t.ticketTypeId,
      t.name,
    ),
  ],
);

/** Optional team mapping; resolution walks from the selected type to its ancestors. */
export const ticketTypeRoutes = sqliteTable("ticket_type_routes", {
  ticketTypeId: text("ticket_type_id").primaryKey(),
  teamId: text("team_id").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** One template series per ticket type. The current version is immediately live. */
export const ticketTemplates = sqliteTable("ticket_templates", {
  id: text("id").primaryKey(),
  ticketTypeId: text("ticket_type_id").notNull().unique(),
  currentVersionId: text("current_version_id"),
  archivedAt: text("archived_at"),
  archivedBy: text("archived_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Immutable template contents; only explicit invalidation audit fields may change. */
export const ticketTemplateVersions = sqliteTable(
  "ticket_template_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull(),
    version: integer("version").notNull(),
    formSchema: text("form_schema").notNull(),
    changeNote: text("change_note"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
    invalidatedAt: text("invalidated_at"),
    invalidatedBy: text("invalidated_by"),
    invalidationReason: text("invalidation_reason"),
  },
  (t) => [
    uniqueIndex("ticket_template_versions_template_version_uq").on(
      t.templateId,
      t.version,
    ),
    index("ticket_template_versions_template_idx").on(t.templateId),
  ],
);

/** Legacy template rows retained read-only for migration and historical audit. */
export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    title: text("title").notNull(),
    categories: text("categories").notNull(),
    formSchema: text("form_schema").notNull(),
  },
  (t) => [index("templates_product_idx").on(t.productId)],
);

export const categoryRoutes = sqliteTable(
  "category_routes",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    teamId: text("team_id").notNull(),
  },
  (t) => [
    index("category_routes_product_category_idx").on(t.productId, t.category),
    uniqueIndex("category_routes_product_category_subcategory_uq").on(
      t.productId,
      t.category,
      t.subcategory,
    ),
  ],
);

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    productId: text("product_id").notNull(),
    teamId: text("team_id").notNull(),
    assigneeId: text("assignee_id"),
    status: text("status").$type<TicketStatus>().notNull(),
    priority: text("priority").$type<TicketPriority>().notNull(),
    subject: text("subject").notNull(),
    content: text("content").notNull(),
    /** Canonical owner link (customers.id); email is display/mail-channel only. */
    customerId: text("customer_id"),
    customerEmail: text("customer_email"),
    customerLevel: integer("customer_level"),
    ticketTypeId: text("ticket_type_id").notNull().default(""),
    templateVersionId: text("template_version_id"),
    ticketTypePath: text("ticket_type_path").notNull().default("[]"),
    /** Legacy template identifier retained for pre-migration history. */
    templateId: text("template_id"),
    metadata: text("metadata"),
    slaAcceptDeadline: text("sla_accept_deadline"),
    slaReplyDeadline: text("sla_reply_deadline"),
    slaAcceptBreached: integer("sla_accept_breached", {
      mode: "boolean",
    }).default(false),
    slaReplyBreached: integer("sla_reply_breached", {
      mode: "boolean",
    }).default(false),
    // Pre-breach warning sent flags (dedupe ticket_expiring notifications)
    slaAcceptWarned: integer("sla_accept_warned", { mode: "boolean" }).default(
      false,
    ),
    slaReplyWarned: integer("sla_reply_warned", { mode: "boolean" }).default(
      false,
    ),
    // AI-related fields
    aiScreeningStatus: text("ai_screening_status").$type<
      "pending" | "processing" | "completed" | "error"
    >(),
    aiScreeningResult: text("ai_screening_result"),
    aiSuggestedReply: text("ai_suggested_reply"),
    aiExtractedIssues: text("ai_extracted_issues"),
    aiKeywords: text("ai_keywords"),
    vectorizeId: text("vectorize_id"),
    // Email-related fields
    source: text("source").$type<"web" | "email" | "api">().default("web"),
    sourceEmailId: text("source_email_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("tickets_tenant_status_idx").on(t.tenantId, t.status),
    index("tickets_team_status_idx").on(t.teamId, t.status),
    index("tickets_product_status_idx").on(t.productId, t.status),
    index("tickets_type_idx").on(t.ticketTypeId),
    index("tickets_template_version_idx").on(t.templateVersionId),
    index("tickets_assignee_idx").on(t.assigneeId),
    index("tickets_customer_idx").on(t.customerEmail, t.productId),
    index("tickets_customer_id_idx").on(t.customerId),
    index("tickets_updated_idx").on(t.updatedAt),
  ],
);

/** Current internal-state values; every mutation also writes ticket history. */
export const ticketInternalStateValues = sqliteTable(
  "ticket_internal_state_values",
  {
    ticketId: text("ticket_id").notNull(),
    stateId: text("state_id").notNull(),
    value: text("value").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.stateId] }),
    index("ticket_internal_state_values_state_idx").on(t.stateId),
  ],
);

export const replies = sqliteTable(
  "replies",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    senderId: text("sender_id"),
    senderEmail: text("sender_email"),
    content: text("content").notNull(),
    internal: integer("internal", { mode: "boolean" }).default(false),
    // Email-related fields
    source: text("source").$type<"web" | "email">().default("web"),
    sourceEmailId: text("source_email_id"),
    emailSent: integer("email_sent", { mode: "boolean" }).default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("replies_ticket_idx").on(t.ticketId)],
);

export const history = sqliteTable(
  "history",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    snapshot: text("snapshot"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("history_ticket_idx").on(t.ticketId)],
);

// ==================== AI Feature Tables ====================

export type AITaskType = "agent" | "prescreening" | "prereply" | "embedding";
export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "deepseek"
  | "qwen"
  | "jina"
  | "cohere";
export type OpenAIApiMode = "responses" | "chat";

export const aiCredentials = sqliteTable(
  "ai_credentials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    provider: text("provider").$type<AIProvider>().notNull(),
    apiMode: text("api_mode")
      .$type<OpenAIApiMode>()
      .notNull()
      .default("responses"),
    apiKey: text("api_key").notNull(),
    secretPurpose: text("secret_purpose").notNull(),
    baseUrl: text("base_url"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
    blockedUntil: text("blocked_until"),
    failureCount: integer("failure_count").notNull().default(0),
    lastFailureAt: text("last_failure_at"),
    lastFailureMessage: text("last_failure_message"),
    lastSuccessAt: text("last_success_at"),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("ai_credentials_provider_idx").on(t.provider),
    index("ai_credentials_available_idx").on(t.enabled, t.blockedUntil),
  ],
);

export const aiConfigs = sqliteTable("ai_configs", {
  id: text("id").primaryKey(),
  taskType: text("task_type").$type<AITaskType>().notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiTaskCredentials = sqliteTable(
  "ai_task_credentials",
  {
    id: text("id").primaryKey(),
    taskType: text("task_type").$type<AITaskType>().notNull(),
    credentialId: text("credential_id").notNull(),
    model: text("model").notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ai_task_credentials_task_credential_unique").on(
      t.taskType,
      t.credentialId,
    ),
    index("ai_task_credentials_task_priority_idx").on(t.taskType, t.priority),
    index("ai_task_credentials_credential_idx").on(t.credentialId),
  ],
);

export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export const productDocuments = sqliteTable("product_documents", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  filename: text("filename").notNull(),
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").$type<DocumentStatus>().default("pending"),
  errorMessage: text("error_message"),
  vectorizeIds: text("vectorize_ids"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type KnowledgeType =
  | "description"
  | "faq"
  | "feature"
  | "policy"
  | "troubleshooting";

export const productKnowledge = sqliteTable("product_knowledge", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  knowledgeType: text("knowledge_type").$type<KnowledgeType>().notNull(),
  vectorizeIds: text("vectorize_ids"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ChatRole = "user" | "assistant" | "tool";

export const aiChatMessages = sqliteTable("ai_chat_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  role: text("role").$type<ChatRole>().notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  toolResults: text("tool_results"),
  createdAt: text("created_at").notNull(),
});

export type TagSource = "ai" | "manual" | "system";

export const ticketTags = sqliteTable("ticket_tags", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  tag: text("tag").notNull(),
  source: text("source").$type<TagSource>().notNull(),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull(),
});

// ==================== Email Feature Tables ====================

export type EmailProvider =
  | "resend"
  | "sendgrid"
  | "mailgun"
  | "maileroo"
  | "cloudflare"
  | "smtp";
export type InboundEmailProvider =
  | "maileroo"
  | "sendgrid"
  | "mailgun"
  | "cloudflare"
  | "generic";
export type EmailTemplateType =
  | "ticket_created"
  | "ticket_replied"
  | "ticket_closed"
  | "ticket_escalated";
export type EmailProcessingStatus =
  | "pending"
  | "processed"
  | "filtered"
  | "quarantined"
  | "releasing"
  | "error";
export type EmailDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";
export type AIFilterStrictness = "low" | "medium" | "high";
export type SpamFilterScope = "global" | "tenant";
export type SpamFilterMode = "inherit" | "disabled" | "custom";
export type SpamFilterVerdict = "allow" | "suspect" | "spam";

/** Optional global or tenant override for a generic HTTPS spam classifier. */
export const spamFilterConfigs = sqliteTable("spam_filter_configs", {
  id: text("id").primaryKey(),
  scopeKey: text("scope_key").notNull().unique(),
  scope: text("scope").$type<SpamFilterScope>().notNull(),
  tenantId: text("tenant_id"),
  mode: text("mode").$type<SpamFilterMode>().notNull().default("inherit"),
  endpointUrl: text("endpoint_url"),
  authSecret: text("auth_secret"),
  timeoutMs: integer("timeout_ms").notNull().default(3000),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const emailConfigs = sqliteTable(
  "email_configs",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().unique(),
    // Inbound settings
    inboundEnabled: integer("inbound_enabled", { mode: "boolean" }).default(
      false,
    ),
    inboundProvider: text("inbound_provider").$type<InboundEmailProvider>(),
    inboundAddress: text("inbound_address"),
    inboundWebhookSecret: text("inbound_webhook_secret"),
    // Outbound settings
    outboundEnabled: integer("outbound_enabled", { mode: "boolean" }).default(
      false,
    ),
    outboundProvider: text("outbound_provider").$type<EmailProvider>(),
    outboundApiKey: text("outbound_api_key"),
    outboundSmtpHost: text("outbound_smtp_host"),
    outboundSmtpPort: integer("outbound_smtp_port"),
    outboundSmtpUser: text("outbound_smtp_user"),
    outboundSmtpPass: text("outbound_smtp_pass"),
    outboundSenderName: text("outbound_sender_name"),
    outboundSenderEmail: text("outbound_sender_email"),
    outboundReplyTo: text("outbound_reply_to"),
    // AI filtering settings
    aiFilterEnabled: integer("ai_filter_enabled", { mode: "boolean" }).default(
      true,
    ),
    aiFilterStrictness: text("ai_filter_strictness")
      .$type<AIFilterStrictness>()
      .default("medium"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("email_configs_inbound_address_uq").on(t.inboundAddress)],
);

export const emailTemplates = sqliteTable(
  "email_templates",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    templateType: text("template_type").$type<EmailTemplateType>().notNull(),
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("email_templates_product_type_uq").on(
      t.productId,
      t.templateType,
    ),
  ],
);

export const inboundEmails = sqliteTable(
  "inbound_emails",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    messageId: text("message_id").notNull(),
    inReplyTo: text("in_reply_to"),
    references: text("references_header"),
    provider: text("provider").$type<InboundEmailProvider>().notNull(),
    // Sender info
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmail: text("to_email").notNull(),
    // Content
    subject: text("subject"),
    bodyPlain: text("body_plain"),
    bodyHtml: text("body_html"),
    autoSubmitted: text("auto_submitted"),
    precedence: text("precedence"),
    listId: text("list_id"),
    returnPath: text("return_path"),
    // Processing result
    processingStatus: text("processing_status")
      .$type<EmailProcessingStatus>()
      .notNull()
      .default("pending"),
    filterResult: text("filter_result"),
    filterStage: text("filter_stage"),
    filterProvider: text("filter_provider"),
    filterVerdict: text("filter_verdict").$type<SpamFilterVerdict>(),
    filterScore: real("filter_score"),
    filterReason: text("filter_reason"),
    candidateTicketId: text("candidate_ticket_id"),
    ticketId: text("ticket_id"),
    replyId: text("reply_id"),
    errorMessage: text("error_message"),
    // Security checks
    spfResult: text("spf_result"),
    dkimResult: integer("dkim_result", { mode: "boolean" }),
    isSpam: integer("is_spam", { mode: "boolean" }),
    // Raw payload
    rawPayload: text("raw_payload"),
    releasedAt: text("released_at"),
    releasedBy: text("released_by"),
    releaseReason: text("release_reason"),
    releaseTicketTypeId: text("release_ticket_type_id"),
    createdAt: text("created_at").notNull(),
    processedAt: text("processed_at"),
  },
  (t) => [
    uniqueIndex("inbound_emails_product_message_uq").on(
      t.productId,
      t.messageId,
    ),
    index("inbound_emails_product_created_idx").on(t.productId, t.createdAt),
  ],
);

export const outboundEmails = sqliteTable(
  "outbound_emails",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    ticketId: text("ticket_id"),
    replyId: text("reply_id"),
    // Email details
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyPlain: text("body_plain"),
    // Delivery info
    provider: text("provider").$type<EmailProvider>().notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status")
      .$type<EmailDeliveryStatus>()
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (t) => [
    index("outbound_emails_product_created_idx").on(t.productId, t.createdAt),
    index("outbound_emails_ticket_idx").on(t.ticketId),
  ],
);

// ==================== Notification Feature Tables ====================

export type NotificationChannelType =
  | "email"
  | "pushdeer"
  | "bark"
  | "ntfy"
  | "telegram"
  | "discord"
  | "slack"
  | "teams"
  | "feishu"
  | "dingtalk"
  | "wecom";
export type NotificationTriggerEvent =
  | "ticket_created"
  | "ticket_assigned"
  | "ticket_reassigned"
  | "ticket_escalated"
  | "ticket_expiring"
  | "customer_replied"
  | "ticket_closed";
export type NotificationRecipientType =
  | "assignee"
  | "ticket_team"
  | "product_agents"
  | "team"
  | "user";
export type NotificationRequirementScope = "product" | "team" | "user";
export type NotificationStatus = "pending" | "sent" | "failed";

/** User-owned destinations. Product rules select channel types, never credentials. */
export const notificationEndpoints = sqliteTable(
  "notification_endpoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    channelType: text("channel_type")
      .$type<NotificationChannelType>()
      .notNull(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    config: text("config").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("notification_endpoints_user_idx").on(t.userId),
    index("notification_endpoints_user_type_idx").on(t.userId, t.channelType),
  ],
);

/** Product-owned routing rules: event -> recipients -> allowed endpoint types. */
export const notificationRules = sqliteTable(
  "notification_rules",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    triggerEvents: text("trigger_events").notNull(),
    channelTypes: text("channel_types").notNull(),
    recipientType: text("recipient_type")
      .$type<NotificationRecipientType>()
      .notNull(),
    recipientTeamId: text("recipient_team_id"),
    recipientUserId: text("recipient_user_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("notification_rules_product_idx").on(t.productId)],
);

/** Compliance requirements for endpoint types at product, team, or user scope. */
export const notificationRequirements = sqliteTable(
  "notification_requirements",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    scopeType: text("scope_type")
      .$type<NotificationRequirementScope>()
      .notNull(),
    scopeTeamId: text("scope_team_id"),
    scopeUserId: text("scope_user_id"),
    triggerEvents: text("trigger_events").notNull(),
    channelTypes: text("channel_types").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("notification_requirements_product_idx").on(t.productId)],
);

export const notificationLogs = sqliteTable(
  "notification_logs",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    ruleId: text("rule_id"),
    requirementId: text("requirement_id"),
    endpointId: text("endpoint_id"),
    recipientUserId: text("recipient_user_id").notNull(),
    channelType: text("channel_type")
      .$type<NotificationChannelType>()
      .notNull(),
    ticketId: text("ticket_id").notNull(),
    triggerEvent: text("trigger_event")
      .$type<NotificationTriggerEvent>()
      .notNull(),
    status: text("status")
      .$type<NotificationStatus>()
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (t) => [
    index("notification_logs_product_created_idx").on(t.productId, t.createdAt),
    index("notification_logs_ticket_idx").on(t.ticketId),
  ],
);

// ==================== Rate Limiting ====================

/**
 * Fixed-window rate-limit counters for public endpoints.
 * `resetAt` is epoch milliseconds; expired rows are reused in place.
 */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
});

// ==================== Type Exports ====================

export type TicketRow = typeof tickets.$inferSelect;
export type ReplyRow = typeof replies.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
export type TicketTypeRow = typeof ticketTypes.$inferSelect;
export type TicketTypePresetRow = typeof ticketTypePresets.$inferSelect;
export type TicketTypeInternalStateRow =
  typeof ticketTypeInternalStates.$inferSelect;
export type TicketInternalStateValueRow =
  typeof ticketInternalStateValues.$inferSelect;
export type TicketTypeRouteRow = typeof ticketTypeRoutes.$inferSelect;
export type TicketTemplateRow = typeof ticketTemplates.$inferSelect;
export type TicketTemplateVersionRow =
  typeof ticketTemplateVersions.$inferSelect;
export type ProductKeyRow = typeof productKeys.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type CategoryRouteRow = typeof categoryRoutes.$inferSelect;

export type AIConfigRow = typeof aiConfigs.$inferSelect;
export type AICredentialRow = typeof aiCredentials.$inferSelect;
export type AITaskCredentialRow = typeof aiTaskCredentials.$inferSelect;
export type ProductDocumentRow = typeof productDocuments.$inferSelect;
export type ProductKnowledgeRow = typeof productKnowledge.$inferSelect;
export type AIChatMessageRow = typeof aiChatMessages.$inferSelect;
export type TicketTagRow = typeof ticketTags.$inferSelect;

export type EmailConfigRow = typeof emailConfigs.$inferSelect;
export type EmailTemplateRow = typeof emailTemplates.$inferSelect;
export type InboundEmailRow = typeof inboundEmails.$inferSelect;
export type OutboundEmailRow = typeof outboundEmails.$inferSelect;
export type SpamFilterConfigRow = typeof spamFilterConfigs.$inferSelect;

export type NotificationEndpointRow = typeof notificationEndpoints.$inferSelect;
export type NotificationRuleRow = typeof notificationRules.$inferSelect;
export type NotificationRequirementRow =
  typeof notificationRequirements.$inferSelect;
export type NotificationLogRow = typeof notificationLogs.$inferSelect;
