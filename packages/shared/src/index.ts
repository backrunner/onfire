export enum Role {
  SuperAdmin = 'super_admin',
  TenantAdmin = 'tenant_admin',
  ProductAdmin = 'product_admin',
  TeamAdmin = 'team_admin',
  Agent = 'agent'
}

export enum TicketStatus {
  New = 'new',
  Processing = 'processing',
  Replied = 'replied',
  Closed = 'closed',
  Escalated = 'escalated'
}

export enum TicketPriority {
  High = 'high',
  Medium = 'medium',
  Low = 'low'
}

export type TenantID = string;
export type ProductID = string;
export type TeamID = string;
export type UserID = string;
export type TicketID = string;
export type TemplateID = string;
export type Category = string;

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

export interface UserProfile {
  id: UserID;
  email: string;
  displayName: string;
  tenantId: TenantID;
  role: Role;
  teamIds?: TeamID[];
}

export interface AgentProfile {
  userId: UserID;
  level: number;
  displayName: string;
  email: string;
  teamIds: TeamID[];
  active: boolean;
}

export interface TicketTemplate {
  id: TemplateID;
  productId: ProductID;
  title: string;
  categories: Category[];
  formSchema: Record<string, unknown>;
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

export interface TicketReply {
  id: string;
  ticketId: TicketID;
  senderId?: UserID;
  senderEmail?: string;
  content: string;
  createdAt: string;
  internal?: boolean;
}

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

export interface SessionContext {
  user: UserProfile;
  agent?: AgentProfile;
  tenantIds: TenantID[];
  productIds: ProductID[];
  teamIds: TeamID[];
}

export interface TicketFilter {
  productId?: ProductID;
  teamId?: TeamID;
  status?: TicketStatus;
  priority?: TicketPriority;
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}

export type Permission =
  | 'ticket.read'
  | 'ticket.write'
  | 'ticket.assign'
  | 'ticket.escalate'
  | 'ticket.close'
  | 'ticket.reassign'
  | 'template.read'
  | 'template.write'
  | 'team.manage'
  | 'product.manage'
  | 'tenant.manage'
  | 'user.manage';

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.SuperAdmin]: ['ticket.read', 'ticket.write', 'ticket.assign', 'ticket.escalate', 'ticket.close', 'ticket.reassign', 'template.read', 'template.write', 'team.manage', 'product.manage', 'tenant.manage', 'user.manage'],
  [Role.TenantAdmin]: ['ticket.read', 'ticket.write', 'ticket.assign', 'ticket.escalate', 'ticket.close', 'ticket.reassign', 'template.read', 'template.write', 'team.manage', 'product.manage', 'user.manage'],
  [Role.ProductAdmin]: ['ticket.read', 'ticket.write', 'ticket.assign', 'ticket.escalate', 'ticket.close', 'ticket.reassign', 'template.read', 'template.write', 'team.manage'],
  [Role.TeamAdmin]: ['ticket.read', 'ticket.write', 'ticket.assign', 'ticket.escalate', 'ticket.close', 'ticket.reassign'],
  [Role.Agent]: ['ticket.read', 'ticket.write', 'ticket.close']
};

export const hasPermission = (role: Role, perm: Permission) => rolePermissions[role]?.includes(perm) ?? false;

