import type { TicketRow, ReplyRow } from "@/drizzle/schema";
import type { history } from "@/drizzle/schema";
import { slaViewOf, type SlaView } from "./sla";

type HistoryRow = typeof history.$inferSelect;

export function parseJsonField(val: string | null | undefined): unknown {
  if (val === null || val === undefined) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

export interface SerializedTicket
  extends Omit<TicketRow, "metadata" | "aiScreeningResult" | "ticketTypePath"> {
  metadata: unknown;
  ticketTypePath: unknown;
  /** Parsed prescreening result ({ issues, keywords, summary, ... }). */
  aiScreeningResult: unknown;
  sla?: SlaView;
}

export function serializeTicket(row: TicketRow): SerializedTicket {
  return {
    ...row,
    metadata: parseJsonField(row.metadata),
    ticketTypePath: parseJsonField(row.ticketTypePath),
    aiScreeningResult: parseJsonField(row.aiScreeningResult),
    sla: slaViewOf(row),
  };
}

export function serializeHistory(rows: HistoryRow[]) {
  return rows.map((h) => ({ ...h, snapshot: parseJsonField(h.snapshot) }));
}

/**
 * Customer-facing ticket projection: strips internal/AI fields that must not
 * leak to the ToC portal.
 */
export function serializeTicketForCustomer(row: TicketRow) {
  return {
    id: row.id,
    productId: row.productId,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    content: row.content,
    metadata: parseJsonField(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Customer-facing reply projection: hides internal notes' content entirely
 * (callers must filter `internal` rows out before serializing).
 */
export function serializeReplyForCustomer(row: ReplyRow) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    content: row.content,
    contentHtml: row.contentHtml,
    fromAgent: Boolean(row.senderId),
    createdAt: row.createdAt,
  };
}
