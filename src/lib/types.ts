// ============================================
// Role and Permission Types
// ============================================

export enum Role {
  SuperAdmin = "super_admin",
  TenantAdmin = "tenant_admin",
  ProductAdmin = "product_admin",
  TeamAdmin = "team_admin",
  Agent = "agent",
}

export enum TicketStatus {
  New = "new",
  Processing = "processing",
  Replied = "replied",
  Closed = "closed",
  Escalated = "escalated",
}

export enum TicketPriority {
  High = "high",
  Medium = "medium",
  Low = "low",
}

// ============================================
// ID Types
// ============================================

export type TenantID = string;
export type ProductID = string;
export type TeamID = string;
export type UserID = string;
export type TicketID = string;
export type TemplateID = string;
export type TicketTypeID = string;
export type TemplateVersionID = string;
export type Category = string;

// ============================================
// Entity Interfaces
// ============================================

export interface Tenant {
  id: TenantID;
  name: string;
  defaultTeamId?: TeamID;
}

export interface Product {
  id: ProductID;
  tenantId: TenantID;
  name: string;
  priorityRules?: {
    respectCustomerLevel?: boolean;
  };
  sla?: PriorityPolicy;
}

export interface Team {
  id: TeamID;
  tenantId: TenantID;
  name: string;
  productIds: ProductID[];
  allowReassign: boolean;
}

export interface TicketTypePathItem {
  id: TicketTypeID;
  name: string;
}

export interface Customer {
  id: string;
  tenantId: TenantID;
  productId: ProductID;
  email?: string | null;
  externalId?: string;
  level?: number;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: TicketID;
  tenantId: TenantID;
  productId: ProductID;
  teamId: TeamID;
  assigneeId?: UserID;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  content: string;
  customerEmail: string;
  customerLevel?: number;
  ticketTypeId: TicketTypeID;
  templateVersionId?: TemplateVersionID | null;
  ticketTypePath: TicketTypePathItem[];
  templateId?: TemplateID;
  metadata?: Record<string, unknown>;
  history: TicketTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  escalated?: boolean;
  sla?: SLAState;
}

export interface TicketTimelineEntry {
  at: string;
  by?: UserID;
  action: string;
  snapshot?: Record<string, unknown>;
}

// ============================================
// SLA Types
// ============================================

export interface SLAConfig {
  acceptWithinMinutes: number;
  replyWithinMinutes: number;
}

export interface PriorityPolicy {
  high: SLAConfig;
  medium: SLAConfig;
  low: SLAConfig;
}

export interface SLAState {
  acceptDeadline: string;
  replyDeadline: string;
  acceptBreached?: boolean;
  replyBreached?: boolean;
}

// ============================================
// Permission Types
// ============================================

export type Permission =
  | "ticket.read"
  | "ticket.write"
  | "ticket.assign"
  | "ticket.escalate"
  | "ticket.close"
  | "ticket.reassign"
  | "template.read"
  | "template.write"
  | "ticket_type.read"
  | "ticket_type.write"
  | "ticket_type.route"
  | "ticket_type.preset.read"
  | "ticket_type.preset.write"
  | "ticket_template.read"
  | "ticket_template.write"
  | "team.manage"
  | "product.settings"
  | "product.manage"
  | "tenant.manage"
  | "user.manage"
  | "role.manage"
  | "customer.read"
  | "customer.write"
  | "agent.profile"
  | "email.config"
  | "spam.config"
  | "notification.manage"
  | "ai.config"
  | "ai.knowledge";

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SuperAdmin]: [
    "ticket.read",
    "ticket.write",
    "ticket.assign",
    "ticket.escalate",
    "ticket.close",
    "ticket.reassign",
    "template.read",
    "template.write",
    "ticket_type.read",
    "ticket_type.write",
    "ticket_type.route",
    "ticket_type.preset.read",
    "ticket_type.preset.write",
    "ticket_template.read",
    "ticket_template.write",
    "team.manage",
    "product.settings",
    "product.manage",
    "tenant.manage",
    "user.manage",
    "role.manage",
    "customer.read",
    "customer.write",
    "agent.profile",
    "email.config",
    "spam.config",
    "notification.manage",
    "ai.config",
    "ai.knowledge",
  ],
  [Role.TenantAdmin]: [
    "ticket.read",
    "ticket.write",
    "ticket.assign",
    "ticket.escalate",
    "ticket.close",
    "ticket.reassign",
    "template.read",
    "template.write",
    "ticket_type.read",
    "ticket_type.write",
    "ticket_type.route",
    "ticket_type.preset.read",
    "ticket_type.preset.write",
    "ticket_template.read",
    "ticket_template.write",
    "team.manage",
    "product.settings",
    "product.manage",
    "user.manage",
    "role.manage",
    "customer.read",
    "customer.write",
    "agent.profile",
    "email.config",
    "spam.config",
    "notification.manage",
    "ai.knowledge",
  ],
  [Role.ProductAdmin]: [
    "ticket.read",
    "ticket.write",
    "ticket.assign",
    "ticket.escalate",
    "ticket.close",
    "ticket.reassign",
    "template.read",
    "template.write",
    "ticket_type.read",
    "ticket_type.write",
    "ticket_type.route",
    "ticket_type.preset.read",
    "ticket_template.read",
    "ticket_template.write",
    "team.manage",
    "product.settings",
    "customer.read",
    "customer.write",
    "agent.profile",
    "email.config",
    "notification.manage",
    "ai.knowledge",
  ],
  [Role.TeamAdmin]: [
    "ticket.read",
    "ticket.write",
    "ticket.assign",
    "ticket.escalate",
    "ticket.close",
    "ticket.reassign",
    "customer.read",
    "ticket_type.read",
    "ticket_type.route",
    "agent.profile",
  ],
  [Role.Agent]: [
    "ticket.read",
    "ticket.write",
    "ticket.escalate",
    "ticket.close",
    "agent.profile",
  ],
};

export const hasPermission = (role: Role, perm: Permission) =>
  rolePermissions[role]?.includes(perm) ?? false;
