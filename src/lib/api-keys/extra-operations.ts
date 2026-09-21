import { z } from "zod";
import { Role, type Permission } from "@/lib/types";
import { CHANNEL_TYPES } from "@/lib/notifications/channel-definitions";
import { SPAM_FILTER_PROVIDERS } from "@/lib/spam-filter-providers";
import { AI_TASK_TYPES } from "@/lib/ai-config";
import type { WebMcpOperation } from "@/lib/webmcp/catalog";

export interface AutomationOperation extends WebMcpOperation {
  contentType?: "multipart/form-data";
}
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const record = z.strictObject({ id });
const product = z.strictObject({ productId: id });
const scope = z.strictObject({
  scope: z.enum(["system", "tenant", "product"]),
  tenantId: id.optional(),
  productId: id.optional(),
});
const adminRoles = [Role.SuperAdmin, Role.TenantAdmin, Role.ProductAdmin];
const endpoint = z.strictObject({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
  config: z
    .record(z.string(), z.unknown())
    .describe(
      "Channel configuration; validate against the chosen channel's required fields. Secret fields are write-only.",
    ),
});
function op(
  name: string,
  description: string,
  permission: Permission | undefined,
  method: WebMcpOperation["method"],
  path: string,
  fields: Partial<AutomationOperation> = {},
): AutomationOperation {
  return {
    name: `onfire_${name}`,
    description,
    permission,
    method,
    path: `/api/tob${path}`,
    params: z.strictObject({}),
    ...fields,
  };
}

export const extraApiKeyOperations: AutomationOperation[] = [
  op(
    "list_notification_endpoints",
    "Read your own receiving endpoints without stored secrets.",
    undefined,
    "GET",
    "/notification-endpoints",
  ),
  op(
    "get_notification_endpoint",
    "Read one of your own receiving endpoints.",
    undefined,
    "GET",
    "/notification-endpoints/:id",
    { params: record },
  ),
  op(
    "create_notification_endpoint",
    "Create your own receiving endpoint. This can redirect your future notifications.",
    undefined,
    "POST",
    "/notification-endpoints",
    { body: endpoint.extend({ channelType: z.enum(CHANNEL_TYPES) }) },
  ),
  op(
    "update_notification_endpoint",
    "Update your own endpoint. Omit secret fields to preserve them; null deletes a config field.",
    undefined,
    "PATCH",
    "/notification-endpoints/:id",
    { params: record, body: endpoint.partial() },
  ),
  op(
    "delete_notification_endpoint",
    "Delete your own receiving endpoint.",
    undefined,
    "DELETE",
    "/notification-endpoints/:id",
    { params: record },
  ),
  op(
    "test_notification_endpoint",
    "Send a real test notification. Email endpoints require a visible productId.",
    undefined,
    "POST",
    "/notification-endpoints/:id/test",
    { params: record, body: z.strictObject({ productId: id.optional() }) },
  ),
  op(
    "test_email_config",
    "Send a real email using the product's saved outbound provider.",
    "email.config",
    "POST",
    "/admin/email-config/:productId/test",
    { params: product, body: z.strictObject({ to: z.email() }) },
  ),
  op(
    "rotate_inbound_webhook_secret",
    "Generate a new product inbound webhook secret, invalidating the previous value. Plaintext is returned once.",
    "email.config",
    "POST",
    "/admin/email-config/:productId/webhook-secret",
    { params: product },
  ),
  op(
    "release_inbound_email",
    "Release a quarantined email through the normal ticket pipeline, with an audited reason.",
    "email.config",
    "POST",
    "/admin/email-logs/inbound/:id/release",
    {
      params: record,
      body: z.strictObject({
        ticketTypeId: id.optional(),
        reason: z.string().trim().min(1).max(1000),
      }),
    },
  ),
  op(
    "get_spam_filter",
    "Read tenant or global spam-filter configuration; stored secrets are omitted.",
    "spam.config",
    "GET",
    "/admin/spam-filter",
    { query: z.strictObject({ tenantId: id.optional() }) },
  ),
  op(
    "update_spam_filter",
    "Configure a tenant or global external spam filter.",
    "spam.config",
    "PATCH",
    "/admin/spam-filter",
    {
      body: z.strictObject({
        tenantId: id.optional(),
        mode: z.enum(["inherit", "disabled", "custom"]),
        provider: z.enum(SPAM_FILTER_PROVIDERS).optional(),
        endpointUrl: z.string().max(2048).nullable().optional(),
        authSecret: z.string().max(2048).optional(),
        timeoutMs: z.number().int().min(500).max(10000).optional(),
      }),
    },
  ),
  op(
    "list_ai_models",
    "Discover models using a credential accessible from the requested AI scope.",
    undefined,
    "GET",
    "/admin/ai/models",
    {
      roles: adminRoles,
      query: scope.extend({
        credentialId: id,
        taskType: z.enum(AI_TASK_TYPES).optional(),
      }),
    },
  ),
  op(
    "delete_ai_route",
    "Delete an AI task route in the specified administration scope.",
    undefined,
    "DELETE",
    "/admin/ai/config/:taskType",
    {
      roles: adminRoles,
      params: z.strictObject({ taskType: z.enum(AI_TASK_TYPES) }),
      query: scope,
    },
  ),
  op(
    "get_ai_usage",
    "Read daily AI usage for an authorized dimension and date interval.",
    undefined,
    "GET",
    "/admin/ai/usage",
    {
      roles: adminRoles,
      query: z.strictObject({
        dimension: z.enum(["system", "tenant", "product"]),
        from: z.iso.date(),
        to: z.iso.date(),
        tenantId: id.optional(),
        productId: id.optional(),
        credentialId: id.optional(),
      }),
    },
  ),
  op(
    "get_ai_usage_settings",
    "Read AI usage retention settings in an authorized scope.",
    undefined,
    "GET",
    "/admin/ai/usage/settings",
    { roles: adminRoles, query: scope },
  ),
  op(
    "update_ai_usage_settings",
    "Update AI usage retention or inheritance; shortening retention allows maintenance to delete old usage data.",
    undefined,
    "PATCH",
    "/admin/ai/usage/settings",
    {
      roles: adminRoles,
      query: scope,
      body: z.strictObject({
        inherit: z.boolean().optional(),
        retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
      }),
    },
  ),
  op(
    "get_knowledge_index_status",
    "Read product knowledge embedding progress.",
    "ai.knowledge",
    "GET",
    "/admin/ai/knowledge/reindex",
    { query: product },
  ),
  op(
    "reindex_knowledge",
    "Queue product knowledge embedding rebuilding; configured providers may incur usage.",
    "ai.knowledge",
    "POST",
    "/admin/ai/knowledge/reindex",
    { body: product },
  ),
  op(
    "list_documents",
    "Read source document metadata. Automatic extraction and indexing is not yet available.",
    "ai.knowledge",
    "GET",
    "/admin/ai/documents",
    { query: product.partial() },
  ),
  op(
    "get_document",
    "Read scoped source document metadata.",
    "ai.knowledge",
    "GET",
    "/admin/ai/documents/:id",
    { params: record },
  ),
  op(
    "delete_document",
    "Delete a scoped source document and its stored blob.",
    "ai.knowledge",
    "DELETE",
    "/admin/ai/documents/:id",
    { params: record },
  ),
  op(
    "upload_document",
    "Upload a source document (PDF, plain text, Markdown, DOC or DOCX, up to 10 MB). This stores the source; extraction is unavailable.",
    "ai.knowledge",
    "POST",
    "/admin/ai/documents",
    { contentType: "multipart/form-data", body: product },
  ),
  op(
    "upload_ticket_image",
    "Upload an inline PNG, JPEG, GIF or WebP up to 5 MB. The result contains a public unguessable image URL.",
    "ticket.write",
    "POST",
    "/tickets/:id/attachments",
    { params: record, contentType: "multipart/form-data" },
  ),
  op(
    "translate_product_content",
    "Generate product-language translation drafts; configured AI providers may incur usage. Saving requires separate type/form write permissions.",
    "ticket_type.write",
    "POST",
    "/admin/ai/translate-content",
    {
      body: z.strictObject({
        productId: id,
        sourceLang: z.string().min(2).max(16),
        targetLangs: z.array(z.string().min(2).max(16)).min(1).max(8),
        texts: z
          .array(z.strictObject({ id, text: z.string().min(1).max(2000) }))
          .min(1)
          .max(100),
      }),
    },
  ),
];
