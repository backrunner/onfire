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

/** Format an ISO timestamp as a localized relative time ("5 minutes ago"). */
export function formatRelativeTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  if (abs < MINUTE) return rtf.format(Math.round(diffMs / 1000), "second");
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), "day");
  return date.toLocaleDateString(locale);
}

/** Format an ISO timestamp as a localized absolute date-time. */
export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
