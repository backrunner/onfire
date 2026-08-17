"use client";

import type { TicketStatus, TicketPriority } from "@/lib/types";
import type { FormSchema } from "@/lib/form-schema";

/** Shapes returned by the /api/toc routes (customer-facing projections). */

export interface TocWhoAmI {
  customerId: string;
  email: string | null;
  productId: string;
  productName: string | null;
  externalId: string | null;
  level: number | null;
  /** email → externalId fallback for the header identity chip. */
  displayName: string | null;
}

export interface TocTicketTypeNode {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  level: number;
  sortOrder: number;
  selectable: boolean;
  children: TocTicketTypeNode[];
}

export interface TocTicketTypeForm {
  ticketTypeId: string;
  templateVersionId: string;
  version: number;
  formSchema: Partial<FormSchema> | Record<string, unknown>;
}

export interface TocTicket {
  id: string;
  productId: string;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  content: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface TocTicketPage {
  items: TocTicket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TocReply {
  id: string;
  ticketId: string;
  content: string;
  /** Sanitized rich-text rendering, when the reply carries formatting. */
  contentHtml?: string | null;
  fromAgent: boolean;
  createdAt: string;
}

export interface TocTicketDetail {
  ticket: TocTicket;
  replies: TocReply[];
}

export interface TocCreateTicketResult {
  ticketId: string;
  status: TicketStatus;
  assigned: boolean;
}

/** Format an ISO timestamp as local `YYYY-MM-DD HH:mm:ss`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
