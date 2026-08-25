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
          label: `${t.tickets.detail.customerTranslation} · ${customerTranslation[0]}`,
          content: customerTranslation[1].content,
          contentHtml: customerTranslation[1].contentHtml,
        }
      : null;

  return (
    <div className={cn("flex", fromAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          internal
            ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/25"
            : fromAgent
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 text-[11px]",
            internal
              ? "text-amber-700 dark:text-amber-400"
              : fromAgent
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
          )}
        >
          <span className="font-medium">
            {fromAgent
              ? reply.senderName || t.tickets.detail.agentReply
              : reply.senderEmail || t.tickets.detail.customerReply}
          </span>
          {internal && (
            <span className="rounded bg-amber-500/20 px-1 py-px font-medium text-amber-700 dark:text-amber-400">
              {t.tickets.detail.internalNote}
            </span>
          )}
          <span>{formatDateTime(reply.createdAt)}</span>
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
    <div className="flex items-center justify-center gap-2 py-0.5">
      <span className="h-px w-6 bg-border" aria-hidden />
      <p className="max-w-[80%] truncate text-center text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">
          {historyLabel(t, event.action)}
        </span>
        {event.actorName && <span> · {event.actorName}</span>}
        {detail && <span> · {detail}</span>}
        <span> · {formatDateTime(event.createdAt)}</span>
      </p>
      <span className="h-px w-6 bg-border" aria-hidden />
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
  stateName?: string;
  previousValue?: string | null;
  value?: string | null;
}

function snapshotDetail(
  snapshot: unknown,
  t: ReturnType<typeof useI18n>["t"],
  actors?: Record<string, string>
): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
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
  return parts.length > 0 ? parts.join(" · ") : null;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
