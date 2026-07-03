"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Clock, ExternalLink, SearchX, User } from "lucide-react";
import { swrFetcher, ApiClientError } from "@/lib/api/client";
import type { TicketDetailResponse } from "@/lib/api/types";
import { TicketStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  PriorityBadge,
  SlaBadge,
} from "@/components/admin/status-badges";
import { TicketActions } from "./ticket-actions";
import { Timeline } from "./timeline";
import { ReplyComposer } from "./reply-composer";
import { formatDuration, interp } from "./utils";

interface TicketDetailProps {
  ticketId: string;
  /** Mobile / full-page back affordance. */
  onBack?: () => void;
  /** Render the back button only below the lg breakpoint (split view). */
  backOnlyMobile?: boolean;
  /** Notify the parent (list) after any mutation. */
  onMutated?: () => void;
  /** Hide the "open full page" link when already on the full page. */
  fullPage?: boolean;
}

/** Right-pane / full-page ticket detail: header, actions, timeline, composer. */
export function TicketDetail({
  ticketId,
  onBack,
  backOnlyMobile,
  onMutated,
  fullPage,
}: TicketDetailProps) {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<TicketDetailResponse>(
    `/api/tob/tickets/${ticketId}`,
    swrFetcher
  );

  const refresh = () => {
    void mutate();
    onMutated?.();
  };

  if (isLoading) return <DetailSkeleton />;

  if (error || !data) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <SearchX className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {notFound
            ? t.tickets.detail.notFound
            : (error instanceof Error && error.message) ||
              t.tickets.list.loadError}
        </p>
        {!notFound && (
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            {t.tickets.list.retry}
          </Button>
        )}
      </div>
    );
  }

  const { ticket, timeline } = data;
  const isClosed = ticket.status === TicketStatus.Closed;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8 shrink-0", backOnlyMobile && "lg:hidden")}
              onClick={onBack}
              aria-label={t.tickets.detail.backToList}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight">
              {ticket.subject}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <SlaBadge
                breached={Boolean(
                  ticket.sla?.acceptBreached || ticket.sla?.replyBreached
                )}
              />
            </div>
          </div>
          {!fullPage && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              asChild
            >
              <Link
                href={`/admin/tickets/${ticket.id}`}
                aria-label={t.tickets.detail.openFull}
              >
                <ExternalLink />
              </Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          <Meta
            icon={<User className="size-3" />}
            label={t.tickets.detail.customer}
            value={ticket.customerEmail}
          />
          <Meta
            label={t.tickets.detail.assignee}
            value={ticket.assigneeId ?? t.tickets.list.unassigned}
          />
          <Meta
            label={t.tickets.detail.createdAt}
            value={formatDateTime(ticket.createdAt)}
          />
          <Meta
            label={t.tickets.detail.updatedAt}
            value={formatDateTime(ticket.updatedAt)}
          />
        </div>

        {!isClosed && ticket.sla && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {ticket.status === TicketStatus.New && ticket.sla.acceptDeadline && (
              <SlaCountdown
                label={t.tickets.detail.acceptDeadline}
                deadline={ticket.sla.acceptDeadline}
                breached={ticket.sla.acceptBreached}
              />
            )}
            {ticket.sla.replyDeadline && (
              <SlaCountdown
                label={t.tickets.detail.replyDeadline}
                deadline={ticket.sla.replyDeadline}
                breached={ticket.sla.replyBreached}
              />
            )}
          </div>
        )}

        <TicketActions ticket={ticket} onMutated={refresh} />
      </div>

      {/* Scrollable conversation */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {t.tickets.detail.content} · {ticket.customerEmail}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {ticket.content}
          </p>
        </div>
        <Separator className="my-4" />
        <Timeline entries={timeline} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <ReplyComposer ticketId={ticket.id} closed={isClosed} onSent={refresh} />
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {icon}
        {label}
      </span>
      <p className="truncate text-foreground/90" title={value}>
        {value}
      </p>
    </div>
  );
}

function SlaCountdown({
  label,
  deadline,
  breached,
}: {
  label: string;
  deadline: string;
  breached: boolean;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const remaining = new Date(deadline).getTime() - now;
  const overdue = breached || remaining <= 0;
  const nearDue = !overdue && remaining < 60 * 60_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        overdue
          ? "font-medium text-red-600 dark:text-red-400"
          : nearDue
            ? "font-medium text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
      )}
    >
      <Clock className="size-3" />
      {label}: {formatDateTime(deadline)}
      {overdue ? (
        <span>({t.tickets.detail.slaOverdue})</span>
      ) : (
        <span>
          ({interp(t.tickets.detail.slaRemaining, { time: formatDuration(remaining) })})
        </span>
      )}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <Skeleton className="h-5 w-3/4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <Skeleton className="h-8 w-2/3" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="ml-auto h-12 w-2/3" />
        <Skeleton className="h-12 w-2/3" />
      </div>
      <div className="border-t border-border p-3">
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
