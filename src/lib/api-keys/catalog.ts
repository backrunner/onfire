import { z } from "zod";
import { hasPermission, Role } from "@/lib/types";
import {
  operationInput,
  webMcpOperations,
  type WebMcpOperation,
} from "@/lib/webmcp/catalog";
import {
  extraApiKeyOperations,
  type AutomationOperation,
} from "./extra-operations";

export interface ApiKeyOperation extends AutomationOperation {
  /** Stable atomic grant ID; new operations never inherit an old grant. */
  id: string;
  productScoped: boolean;
}

// Only handlers that enforce product/ticket delegation may use selected products.
// Tenant, staff and system configuration deliberately require account scope.
function supportsProducts(operation: WebMcpOperation): boolean {
  const path = operation.path.slice("/api/tob".length);
  return (
    path === "/dashboard" ||
    path.startsWith("/tickets") ||
    path.startsWith("/meta/") ||
    path === "/admin/customers" ||
    (path.startsWith("/admin/products") &&
      operation.name !== "onfire_create_product") ||
    path.startsWith("/admin/ticket-types") ||
    path.startsWith("/admin/email-") ||
    path.startsWith("/admin/notification-") ||
    path.startsWith("/admin/ai/knowledge") ||
    path.startsWith("/admin/ai/documents") ||
    path === "/admin/ai/translate-content" ||
    path.startsWith("/admin/product-keys")
  );
}

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const expiry = z.iso.datetime({ offset: true });
const productKeyOperations: WebMcpOperation[] = [
  {
    name: "onfire_list_product_keys",
    description:
      "List customer token-issuance keys for accessible products; no secrets.",
    method: "GET",
    path: "/api/tob/admin/product-keys",
    params: z.strictObject({}),
    query: z.strictObject({ productId: id.optional() }),
  },
  {
    name: "onfire_create_product_key",
    description:
      "Create a customer token-issuance key; plaintext is returned once. This grants customer impersonation within that product.",
    method: "POST",
    path: "/api/tob/admin/product-keys",
    params: z.strictObject({}),
    body: z.strictObject({
      productId: id,
      name: z.string().max(100).optional(),
      expiresAt: expiry.optional(),
    }),
  },
  {
    name: "onfire_get_product_key",
    description: "Read product key metadata, expiry and revocation status.",
    method: "GET",
    path: "/api/tob/admin/product-keys/:id",
    params: z.strictObject({ id }),
  },
  {
    name: "onfire_update_product_key",
    description:
      "Rename a product key, set its expiry, or revoke it. Revocation cannot be undone.",
    method: "PATCH",
    path: "/api/tob/admin/product-keys/:id",
    params: z.strictObject({ id }),
    body: z.strictObject({
      name: z.string().max(100).optional(),
      revoked: z.literal(true).optional(),
      expiresAt: expiry.optional(),
    }),
  },
  {
    name: "onfire_delete_product_key",
    description: "Permanently delete a product key.",
    method: "DELETE",
    path: "/api/tob/admin/product-keys/:id",
    params: z.strictObject({ id }),
  },
  {
    name: "onfire_rotate_product_key",
    description:
      "Invalidate the old secret and return a new product key secret once; preserves expiry.",
    method: "POST",
    path: "/api/tob/admin/product-keys/:id/rotate",
    params: z.strictObject({ id }),
  },
];

export const apiKeyOperations: ApiKeyOperation[] = [
  ...webMcpOperations.filter(
    (operation) => operation.name !== "onfire_get_context",
  ),
  ...productKeyOperations.map((operation) => ({
    ...operation,
    permission: "product.settings" as const,
  })),
  ...extraApiKeyOperations,
].map((operation) => ({
  ...operation,
  id: operation.name.slice("onfire_".length),
  productScoped: supportsProducts(operation),
}));

// Public replies and internal notes are independently grantable on the same URL.
const reply = apiKeyOperations.find(
  (operation) => operation.id === "reply_ticket",
)!;
reply.body = reply.body!.extend({ internal: z.literal(false).optional() });
apiKeyOperations.push({
  ...reply,
  id: "add_ticket_note",
  name: "onfire_add_ticket_note",
  description: "Add an internal note; never send it to the customer.",
  body: reply.body.extend({ internal: z.literal(true) }),
});
const assign = apiKeyOperations.find(
  (operation) => operation.id === "assign_ticket",
)!;
assign.description =
  "Assign an unassigned ticket to an active agent in its team.";
assign.permission = "ticket.assign";
apiKeyOperations.push({
  ...assign,
  id: "reassign_ticket",
  name: "onfire_reassign_ticket",
  permission: "ticket.reassign",
  description:
    "Reassign an assigned ticket within its team. Agents must also pass the live team reassignment policy.",
});
apiKeyOperations.find((operation) => operation.id === "bulk_assign_tickets")!.description =
  "Assign up to 100 tickets. Already assigned tickets additionally require reassign_ticket. Inspect every per-item result.";

export function availableApiKeyOperations(
  role: Role,
  resourceMode: "all" | "products",
  agentReassign = false,
): ApiKeyOperation[] {
  return apiKeyOperations.filter(
    (operation) =>
      (resourceMode === "all" || operation.productScoped) &&
      (!operation.roles || operation.roles.includes(role)) &&
      (!operation.permission ||
        hasPermission(role, operation.permission) ||
        (operation.id === "reassign_ticket" &&
          role === Role.Agent &&
          agentReassign)),
  );
}

export function matchingApiKeyOperations(
  method: string,
  pathname: string,
  params: Record<string, string>,
): ApiKeyOperation[] {
  // Keep path aliases/encoding out of the credential authorization boundary.
  if (!/^\/api\/tob\/[a-zA-Z0-9_/-]+$/.test(pathname)) return [];
  const parts = pathname.split("/");
  return apiKeyOperations.filter((operation) => {
    const pattern = operation.path.split("/");
    return (
      operation.method === method &&
      pattern.length === parts.length &&
      Object.keys(operation.params.shape).length ===
        Object.keys(params).length &&
      pattern.every((segment, index) =>
        segment.startsWith(":")
          ? /^[a-zA-Z0-9_-]+$/.test(parts[index]) &&
            params[segment.slice(1)] === parts[index]
          : segment === parts[index],
      )
    );
  });
}

export function describeApiKeyOperation(operation: ApiKeyOperation) {
  return {
    id: operation.id,
    description: operation.description,
    method: operation.method,
    path: operation.path,
    productScoped: operation.productScoped,
    ...(operation.contentType
      ? { contentType: operation.contentType, fileField: "file" }
      : {}),
    inputSchema: z.toJSONSchema(operationInput(operation), { io: "input" }),
  };
}
