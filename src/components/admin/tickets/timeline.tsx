"use client";

import { MessageSquare } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { RichTextView } from "@/components/rich-text-view";
import { useI18n } from "@/lib/i18n";
import { TicketStatus, TicketPriority } from "@/lib/types";
import type { TimelineEntry, ReplyView, HistoryView } from "@/lib/api/types";
import { historyLabel } from "./utils";

interface TimelineProps {
  entries: TimelineEntry[];
  /** userId → display name, used to label assignees inside history snapshots. */
  actors?: Record<string, string>;
}

/** Merged conversation: replies as chat bubbles, history as system lines. */
export function Timeline({ entries, actors }: TimelineProps) {
  const { t } = useI18n();

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <MessageSquare className="size-6 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {t.tickets.detail.noReplies}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) =>
        entry.type === "reply" ? (
          <ReplyBubble key={`r-${entry.id}`} reply={entry} />
        ) : (
          <HistoryLine key={`h-${entry.id}`} event={entry} actors={actors} />
        )
      )}
    </div>
  );
}

function ReplyBubble({ reply }: { reply: ReplyView }) {
  const { t } = useI18n();
  const fromAgent = Boolean(reply.senderId);
  const internal = Boolean(reply.internal);
  const customerTranslation = fromAgent
    ? Object.entries(reply.translations ?? {})[0]
    : undefined;
  const alternate = reply.originalContent
    ? {
        label: t.tickets.detail.showOriginal,
        content: reply.originalContent,
        contentHtml: reply.originalContentHtml,
      }
    : customerTranslation
      ? {
          label: t.tickets.detail.customerTranslation,
          language: customerTranslation[0],
          content: customerTranslation[1].content,
          contentHtml: customerTranslation[1].contentHtml,
        }
      : null;

  return (
    <div className={cn("flex", fromAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm",
          internal
            ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/25"
            : fromAgent
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
        )}
      >
        <div
          className={cn(
            "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]",
            internal
              ? "text-amber-700 dark:text-amber-400"
              : fromAgent
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
          )}
        >
          <span className="min-w-0 wrap-anywhere font-medium">
            {fromAgent
              ? reply.senderName || t.tickets.detail.agentReply
              : reply.senderEmail || t.tickets.detail.customerReply}
          </span>
          {internal && (
            <span className="rounded bg-amber-500/20 px-1 py-px font-medium text-amber-700 dark:text-amber-400">
              {t.tickets.detail.internalNote}
            </span>
          )}
          <time dateTime={reply.createdAt} className="shrink-0 tabular-nums">{formatDateTime(reply.createdAt)}</time>
        </div>
        {reply.contentHtml ? (
          <RichTextView html={reply.contentHtml} />
        ) : (
          <p
            className={cn(
              "whitespace-pre-wrap break-words",
              internal && "text-foreground"
            )}
          >
            {reply.content}
          </p>
        )}
        {alternate && alternate.content !== reply.content && (
          <details
            className={cn(
              "mt-2 border-t pt-2 text-xs",
              fromAgent && !internal
                ? "border-primary-foreground/20"
                : "border-border/70"
            )}
          >
            <summary className="cursor-pointer opacity-75">
              {alternate.label}
              {"language" in alternate && <span className="ml-2 rounded border px-1 py-px text-[10px] uppercase">{alternate.language}</span>}
            </summary>
            <div className="mt-2 opacity-90">
              {alternate.contentHtml ? (
                <RichTextView html={alternate.contentHtml} />
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {alternate.content}
                </p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function HistoryLine({
  event,
  actors,
}: {
  event: HistoryView;
  actors?: Record<string, string>;
}) {
  const { t } = useI18n();
  const detail = snapshotDetail(event.snapshot, t, actors);

  return (
    <div className="border-l-2 border-border py-1 pl-3 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-medium text-foreground/80">{historyLabel(t, event.action)}</span>
        <time dateTime={event.createdAt} className="shrink-0 tabular-nums">{formatDateTime(event.createdAt)}</time>
      </div>
      {event.actorName && <p className="mt-0.5 wrap-anywhere">{event.actorName}</p>}
      {detail.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {detail.map((part, index) => <li key={index} className="wrap-anywhere">{part}</li>)}
        </ul>
      )}
    </div>
  );
}

interface Snapshot {
  previousStatus?: string;
  newStatus?: string;
  previousPriority?: string;
  newPriority?: string;
  previousAssignee?: string | null;
  newAssignee?: string;
  newAssigneeLevel?: number;
  reason?: string;
  notifyCustomer?: boolean;
  stateName?: string;
  previousValue?: string | null;
  value?: string | null;
}

function snapshotDetail(
  snapshot: unknown,
  t: ReturnType<typeof useI18n>["t"],
  actors?: Record<string, string>
): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const s = snapshot as Snapshot;
  const parts: string[] = [];

  const statusLabel = (v: string) =>
    t.tickets.status[v as TicketStatus] ?? v;
  const priorityLabel = (v: string) =>
    t.tickets.priority[v as TicketPriority] ?? v;

  if (s.newStatus) {
    parts.push(
      s.previousStatus
        ? `${statusLabel(s.previousStatus)} → ${statusLabel(s.newStatus)}`
        : statusLabel(s.newStatus)
    );
  } else if (s.previousStatus) {
    parts.push(statusLabel(s.previousStatus));
  }
  if (s.newPriority) {
    parts.push(
      s.previousPriority
        ? `${priorityLabel(s.previousPriority)} → ${priorityLabel(s.newPriority)}`
        : priorityLabel(s.newPriority)
    );
  }
  if (s.newAssignee) {
    parts.push(`→ ${actors?.[s.newAssignee] ?? shortId(s.newAssignee)}`);
  }
  if (s.notifyCustomer === false) parts.push(t.tickets.actions.silentClose);
  if (s.reason) {
    parts.push(s.reason);
  }
  if (s.stateName) {
    const display = (value: string | null | undefined) => {
      if (value === "true") return t.common.yes;
      if (value === "false") return t.common.no;
      return value || "—";
    };
    parts.push(`${s.stateName}: ${display(s.previousValue)} → ${display(s.value)}`);
  }
  return parts;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
