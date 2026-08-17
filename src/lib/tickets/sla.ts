import { TicketPriority, TicketStatus } from "@/lib/types";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { tickets, type products } from "@/drizzle/schema";

type ProductRow = typeof products.$inferSelect;

export interface SlaDeadlines {
  slaAcceptDeadline: string | null;
  slaReplyDeadline: string | null;
}

export interface ReplySlaReset {
  slaReplyDeadline: string | null;
  slaReplyBreached: boolean;
  slaReplyWarned: boolean;
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

/** Compute creation-time deadlines; an unassigned ticket has no reply SLA yet. */
export function computeInitialSlaDeadlines(
  product: ProductRow,
  priority: TicketPriority,
  accepted: boolean,
  from: Date = new Date()
): SlaDeadlines {
  const deadlines = computeSlaDeadlines(product, priority, from);
  return accepted
    ? deadlines
    : { ...deadlines, slaReplyDeadline: null };
}

/** Start (or restart) the reply SLA when a ticket is accepted/escalated. */
export function restartReplySla(
  product: ProductRow,
  priority: TicketPriority,
  from: Date = new Date()
): ReplySlaReset {
  return {
    slaReplyDeadline: computeSlaDeadlines(product, priority, from)
      .slaReplyDeadline,
    slaReplyBreached: false,
    slaReplyWarned: false,
  };
}

/** Compute the reply-SLA side effects of a manual status transition. */
export function statusTransitionSlaUpdate(
  ticket: Pick<
    typeof tickets.$inferSelect,
    "assigneeId" | "priority" | "status"
  >,
  nextStatus: TicketStatus,
  product: ProductRow | null | undefined,
  from: Date = new Date(),
): Partial<typeof tickets.$inferInsert> {
  if (nextStatus === TicketStatus.Replied) {
    return { slaReplyDeadline: null };
  }
  if (
    product &&
    ticket.assigneeId &&
    (ticket.status === TicketStatus.New || ticket.status === TicketStatus.Closed) &&
    nextStatus === TicketStatus.Processing
  ) {
    // Accept (new) and reopen (closed) both restart the reply SLA.
    return restartReplySla(product, ticket.priority, from);
  }
  // Reopening without an assignee must not resurrect a stale reply deadline.
  if (ticket.status === TicketStatus.Closed && nextStatus === TicketStatus.Processing) {
    return { slaReplyDeadline: null };
  }
  return {};
}

/** SQL predicate for currently active SLA breaches (not historical flags). */
export function activeSlaOverdueCondition(
  now = new Date().toISOString()
): SQL {
  const acceptOverdue = and(
    eq(tickets.status, TicketStatus.New),
    or(
      eq(tickets.slaAcceptBreached, true),
      sql`(${tickets.slaAcceptDeadline} IS NOT NULL AND ${tickets.slaAcceptDeadline} < ${now})`
    )
  );
  const replyOverdue = and(
    inArray(tickets.status, [TicketStatus.Processing, TicketStatus.Escalated]),
    or(
      eq(tickets.slaReplyBreached, true),
      sql`(${tickets.slaReplyDeadline} IS NOT NULL AND ${tickets.slaReplyDeadline} < ${now})`
    )
  );
  return or(acceptOverdue, replyOverdue)!;
}

/** Runtime equivalent used when serializing already-loaded ticket rows. */
export function isTicketSlaOverdue(
  row: Pick<
    typeof tickets.$inferSelect,
    | "status"
    | "slaAcceptDeadline"
    | "slaReplyDeadline"
    | "slaAcceptBreached"
    | "slaReplyBreached"
  >,
  now = Date.now()
): boolean {
  if (row.status === TicketStatus.New) {
    return (
      Boolean(row.slaAcceptBreached) ||
      (row.slaAcceptDeadline !== null &&
        Date.parse(row.slaAcceptDeadline) < now)
    );
  }
  if (
    row.status === TicketStatus.Processing ||
    row.status === TicketStatus.Escalated
  ) {
    return (
      Boolean(row.slaReplyBreached) ||
      (row.slaReplyDeadline !== null && Date.parse(row.slaReplyDeadline) < now)
    );
  }
  return false;
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
  status?: TicketStatus;
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
  const replyVisible =
    row.status === undefined ||
    row.status === TicketStatus.Processing ||
    row.status === TicketStatus.Escalated;
  const replyAt =
    replyVisible && row.slaReplyDeadline
      ? Date.parse(row.slaReplyDeadline)
      : null;
  return {
    acceptDeadline: row.slaAcceptDeadline ?? undefined,
    replyDeadline: replyVisible ? row.slaReplyDeadline ?? undefined : undefined,
    acceptBreached: Boolean(row.slaAcceptBreached) || (acceptAt !== null && acceptAt < now),
    replyBreached:
      (replyVisible && Boolean(row.slaReplyBreached)) ||
      (replyAt !== null && replyAt < now),
  };
}
