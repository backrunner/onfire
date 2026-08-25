import type { TicketRow, ReplyRow } from "@/drizzle/schema";
import type { history } from "@/drizzle/schema";
import { slaViewOf, type SlaView } from "./sla";
import {
  parseReplyTranslationMap,
  parseTranslationMap,
  translatedReply,
  translatedTicketText,
  type ReplyTranslationMap,
  type TranslationMap,
} from "./translation";

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
  extends Omit<
    TicketRow,
    | "metadata"
    | "aiScreeningResult"
    | "ticketTypePath"
    | "subjectTranslations"
    | "contentTranslations"
  > {
  metadata: unknown;
  ticketTypePath: unknown;
  subjectTranslations: TranslationMap;
  contentTranslations: TranslationMap;
  originalSubject?: string;
  originalContent?: string;
  /** Parsed prescreening result ({ issues, keywords, summary, ... }). */
  aiScreeningResult: unknown;
  sla?: SlaView;
}

export function serializeTicket(row: TicketRow, language?: string): SerializedTicket {
  const subject = language ? translatedTicketText(row, language, "subject") : row.subject;
  const content = language ? translatedTicketText(row, language, "content") : row.content;
  return {
    ...row,
    subject,
    content,
    subjectTranslations: parseTranslationMap(row.subjectTranslations),
    contentTranslations: parseTranslationMap(row.contentTranslations),
    ...(subject !== row.subject ? { originalSubject: row.subject } : {}),
    ...(content !== row.content ? { originalContent: row.content } : {}),
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
export function serializeTicketForCustomer(row: TicketRow, language: string) {
  return {
    id: row.id,
    productId: row.productId,
    status: row.status,
    priority: row.priority,
    subject: translatedTicketText(row, language, "subject"),
    content: translatedTicketText(row, language, "content"),
    metadata: parseJsonField(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Customer-facing reply projection: hides internal notes' content entirely
 * (callers must filter `internal` rows out before serializing).
 */
export function serializeReplyForCustomer(row: ReplyRow, language: string) {
  const projected = translatedReply(row, language);
  return {
    id: row.id,
    ticketId: row.ticketId,
    content: projected.content,
    contentHtml: projected.contentHtml,
    fromAgent: Boolean(row.senderId),
    createdAt: row.createdAt,
  };
}

/** Agent-facing reply projection keeps the original available for audit. */
export function serializeReplyForAgent(row: ReplyRow, language: string) {
  const translations: ReplyTranslationMap = parseReplyTranslationMap(row.translations);
  const projected = row.senderId ? null : translatedReply(row, language);
  return {
    ...row,
    translations,
    ...(projected && projected.content !== row.content
      ? {
          content: projected.content,
          contentHtml: projected.contentHtml,
          originalContent: row.content,
          originalContentHtml: row.contentHtml,
          translatedLanguage: language,
        }
      : {}),
  };
}
