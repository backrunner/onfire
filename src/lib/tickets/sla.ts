import { TicketPriority } from "@/lib/types";
import type { products } from "@/drizzle/schema";

type ProductRow = typeof products.$inferSelect;

export interface SlaDeadlines {
  slaAcceptDeadline: string | null;
  slaReplyDeadline: string | null;
}

function slaMinutes(
  product: ProductRow,
  priority: TicketPriority
): { accept: number | null; reply: number | null } {
  switch (priority) {
    case TicketPriority.High:
      return { accept: product.slaHighAccept, reply: product.slaHighReply };
    case TicketPriority.Low:
      return { accept: product.slaLowAccept, reply: product.slaLowReply };
    default:
      return { accept: product.slaMediumAccept, reply: product.slaMediumReply };
  }
}

/**
 * Compute SLA deadlines for a ticket from the product's per-priority policy.
 * Used on creation and when SLA timers are reset (reassignment).
 */
export function computeSlaDeadlines(
  product: ProductRow,
  priority: TicketPriority,
  from: Date = new Date()
): SlaDeadlines {
  const { accept, reply } = slaMinutes(product, priority);
  return {
    slaAcceptDeadline: accept
      ? new Date(from.getTime() + accept * 60_000).toISOString()
      : null,
    slaReplyDeadline: reply
      ? new Date(from.getTime() + reply * 60_000).toISOString()
      : null,
  };
}

export interface SlaView {
  acceptDeadline?: string;
  replyDeadline?: string;
  acceptBreached: boolean;
  replyBreached: boolean;
}

/**
 * Live SLA view for API responses: combines persisted breach flags (set by
 * the cron scan) with a real-time deadline check so the UI never lags.
 */
export function slaViewOf(row: {
  slaAcceptDeadline: string | null;
  slaReplyDeadline: string | null;
  slaAcceptBreached: boolean | null;
  slaReplyBreached: boolean | null;
}): SlaView | undefined {
  if (!row.slaAcceptDeadline && !row.slaReplyDeadline) return undefined;
  const now = Date.now();
  const acceptAt = row.slaAcceptDeadline
    ? Date.parse(row.slaAcceptDeadline)
    : null;
  const replyAt = row.slaReplyDeadline ? Date.parse(row.slaReplyDeadline) : null;
  return {
    acceptDeadline: row.slaAcceptDeadline ?? undefined,
    replyDeadline: row.slaReplyDeadline ?? undefined,
    acceptBreached: Boolean(row.slaAcceptBreached) || (acceptAt !== null && acceptAt < now),
    replyBreached: Boolean(row.slaReplyBreached) || (replyAt !== null && replyAt < now),
  };
}
