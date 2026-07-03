import { TicketStatus } from "@/lib/types";
import type { Translations } from "@/locales/zh";

/** Interpolate `{{key}}` placeholders in a locale string. */
export function interp(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{{${key}}}`
  );
}

/** Client-side mirror of the backend ticket state machine. */
export const VALID_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.New]: [
    TicketStatus.Processing,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Processing]: [
    TicketStatus.Replied,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Replied]: [
    TicketStatus.Processing,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Escalated]: [
    TicketStatus.Processing,
    TicketStatus.Replied,
    TicketStatus.Closed,
  ],
  [TicketStatus.Closed]: [],
};

export const ALL_STATUSES = [
  TicketStatus.New,
  TicketStatus.Processing,
  TicketStatus.Replied,
  TicketStatus.Escalated,
  TicketStatus.Closed,
] as const;

/** Response shape of /api/tob/tickets/bulk/* endpoints. */
export interface BulkResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: { id: string; success: boolean; error?: string }[];
}

/** Localized label for a history action, falling back to the raw action. */
export function historyLabel(t: Translations, action: string): string {
  const labels = t.tickets.historyActions as Record<string, string | undefined>;
  return labels[action] ?? action;
}

/** Compact duration like "2h 15m", "45m", "3d 4h". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
