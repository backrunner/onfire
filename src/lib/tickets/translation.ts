import type { ReplyRow, TicketRow } from "@/drizzle/schema";

export interface ReplyTranslation {
  content: string;
  contentHtml?: string | null;
}

export type TranslationMap = Record<string, string>;
export type ReplyTranslationMap = Record<string, ReplyTranslation>;

function parseObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseTranslationMap(value: string | null | undefined): TranslationMap {
  const parsed = parseObject(value);
  return Object.fromEntries(
    Object.entries(parsed).filter(([, item]) => typeof item === "string" && item.trim())
  ) as TranslationMap;
}

export function parseReplyTranslationMap(
  value: string | null | undefined
): ReplyTranslationMap {
  const parsed = parseObject(value);
  const result: ReplyTranslationMap = {};
  for (const [language, item] of Object.entries(parsed)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content !== "string" || !content.trim()) continue;
    const contentHtml = (item as { contentHtml?: unknown }).contentHtml;
    result[language] = {
      content,
      contentHtml: typeof contentHtml === "string" ? contentHtml : null,
    };
  }
  return result;
}

export function jsonTranslationMap(map: TranslationMap): string | null {
  return Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

export function jsonReplyTranslationMap(map: ReplyTranslationMap): string | null {
  return Object.keys(map).length > 0 ? JSON.stringify(map) : null;
}

export function translatedTicketText(
  row: TicketRow,
  language: string,
  field: "subject" | "content"
): string {
  const map = parseTranslationMap(
    field === "subject" ? row.subjectTranslations : row.contentTranslations
  );
  return map[language] ?? (field === "subject" ? row.subject : row.content);
}

export function translatedReply(
  row: ReplyRow,
  language: string
): ReplyTranslation {
  const map = parseReplyTranslationMap(row.translations);
  return map[language] ?? {
    content: row.content,
    contentHtml: row.contentHtml,
  };
}
