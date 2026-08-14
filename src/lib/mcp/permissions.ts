import { hasPermission, Role, type Permission } from "@/lib/types";

export const MCP_PERMISSION_DEFINITIONS = [
  { id: "tickets:read", group: "tickets", required: "ticket.read" },
  { id: "tickets:reply", group: "tickets", required: "ticket.write" },
  { id: "tickets:update_status", group: "tickets", required: "ticket.write" },
  { id: "tickets:update_priority", group: "tickets", required: "ticket.write" },
  { id: "tickets:assign", group: "tickets", required: "ticket.assign" },
  { id: "tickets:reassign", group: "tickets", required: "ticket.reassign" },
  { id: "tickets:escalate", group: "tickets", required: "ticket.escalate" },
  { id: "tickets:close", group: "tickets", required: "ticket.close" },
  { id: "settings:read", group: "settings", required: "product.settings" },
  { id: "settings:write", group: "settings", required: "product.settings" },
] as const satisfies readonly {
  id: string;
  group: "tickets" | "settings";
  required: Permission;
}[];

export type McpPermission = (typeof MCP_PERMISSION_DEFINITIONS)[number]["id"];

export const MCP_PERMISSION_IDS = MCP_PERMISSION_DEFINITIONS.map(
  (definition) => definition.id,
) as [McpPermission, ...McpPermission[]];

const MCP_PERMISSION_SET = new Set<string>(MCP_PERMISSION_IDS);

export function isMcpPermission(value: string): value is McpPermission {
  return MCP_PERMISSION_SET.has(value);
}

export interface McpPermissionAvailability {
  agentReassignEnabled?: boolean;
}

function isMcpPermissionAvailable(
  role: Role,
  definition: (typeof MCP_PERMISSION_DEFINITIONS)[number],
  availability: McpPermissionAvailability,
): boolean {
  return (
    hasPermission(role, definition.required) ||
    (role === Role.Agent &&
      definition.id === "tickets:reassign" &&
      availability.agentReassignEnabled === true)
  );
}

export function availableMcpPermissions(
  role: Role,
  availability: McpPermissionAvailability = {},
): McpPermission[] {
  return MCP_PERMISSION_DEFINITIONS.filter((definition) =>
    isMcpPermissionAvailable(role, definition, availability),
  ).map((definition) => definition.id);
}

export function effectiveMcpPermissions(
  role: Role,
  granted: readonly string[],
  availability: McpPermissionAvailability = {},
): McpPermission[] {
  const available = new Set(availableMcpPermissions(role, availability));
  return granted.filter(
    (permission): permission is McpPermission =>
      isMcpPermission(permission) && available.has(permission),
  );
}
