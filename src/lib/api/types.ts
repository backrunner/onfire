import type { Permission, Role, TicketPriority, TicketStatus } from "@/lib/types";

/** Pagination envelope returned by list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface SlaView {
  acceptDeadline?: string;
  replyDeadline?: string;
  acceptBreached: boolean;
  replyBreached: boolean;
}

export interface TicketView {
  id: string;
  tenantId: string;
  productId: string;
  teamId: string;
  assigneeId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  content: string;
  customerEmail: string;
  customerLevel: number | null;
  templateId: string | null;
  metadata?: unknown;
  sla?: SlaView;
  source: "web" | "email" | "api" | null;
  createdAt: string;
  updatedAt: string;
  aiScreeningStatus?: string | null;
  aiSuggestedReply?: string | null;
}

export interface ReplyView {
  id: string;
  ticketId: string;
  senderId: string | null;
  senderEmail: string | null;
  content: string;
  internal: boolean | null;
  source: "web" | "email" | null;
  createdAt: string;
}

export interface HistoryView {
  id: string;
  ticketId: string;
  actorId: string | null;
  action: string;
  snapshot?: unknown;
  createdAt: string;
}

export type TimelineEntry =
  | ({ type: "reply" } & ReplyView)
  | ({ type: "history" } & HistoryView);

export interface TicketDetailResponse {
  ticket: TicketView;
  replies: ReplyView[];
  history: HistoryView[];
  timeline: TimelineEntry[];
}

export interface MeResponse {
  user: { id: string; email: string; displayName: string; tenantId: string };
  role: Role;
  permissions: Permission[];
  tenantIds: string[];
  productIds: string[];
  teamIds: string[];
  agent?: { level: number; active: boolean } | null;
}

export interface TeamView {
  id: string;
  tenantId: string;
  name: string;
  allowReassign: boolean | null;
}

export interface ProductView {
  id: string;
  tenantId: string;
  name: string;
  slaHighAccept: number | null;
  slaHighReply: number | null;
  slaMediumAccept: number | null;
  slaMediumReply: number | null;
  slaLowAccept: number | null;
  slaLowReply: number | null;
  autoCloseMinutes: number | null;
}

export interface AgentView {
  userId: string;
  displayName?: string;
  email?: string;
  level: number;
  active: boolean;
  teamIds?: string[];
}

export interface CustomerView {
  id: string;
  tenantId: string;
  productId: string;
  email: string;
  externalId: string | null;
  level: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardResponse {
  stats: {
    pending: number;
    escalated: number;
    overdue: number;
    products: number;
  };
  recentTickets: Array<{
    id: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    createdAt: string;
  }>;
}
