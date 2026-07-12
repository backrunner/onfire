"use client";

import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import type { Paginated, TicketView } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  PriorityBadge,
  SlaBadge,
} from "@/components/admin/status-badges";
import { interp } from "./utils";

interface TicketListProps {
  data?: Paginated<TicketView>;
  isLoading: boolean;
  error?: Error;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selection: ReadonlySet<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onPageChange: (page: number) => void;
}

/** Left-pane compact ticket list with multi-select and pagination. */
export function TicketList({
  data,
  isLoading,
  error,
  onRetry,
  selectedId,
  onSelect,
  selection,
  onToggle,
  onToggleAll,
  onPageChange,
}: TicketListProps) {
  const { t } = useI18n();

  if (isLoading && !data) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {error.message || t.tickets.list.loadError}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t.tickets.list.retry}
        </Button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const page = data?.page ?? 1;
  const allChecked = items.length > 0 && items.every((i) => selection.has(i.id));

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <Inbox className="size-7 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t.tickets.list.noTickets}</p>
        <p className="text-xs text-muted-foreground">
          {t.tickets.list.noTicketsHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Select-all header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={allChecked}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
          aria-label={t.common.all}
        />
        <span>{interp(t.tickets.list.total, { count: data?.total ?? 0 })}</span>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-border">
          {items.map((ticket) => (
            <li key={ticket.id}>
              <div
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                  selectedId === ticket.id && "bg-accent"
                )}
                onClick={() => onSelect(ticket.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(ticket.id);
                  }
                }}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selection.has(ticket.id)}
                  onCheckedChange={(checked) =>
                    onToggle(ticket.id, checked === true)
                  }
                  onClick={(e) => e.stopPropagation()}
                  aria-label={ticket.subject}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    <SlaBadge
                      breached={Boolean(
                        ticket.sla?.acceptBreached || ticket.sla?.replyBreached
                      )}
                    />
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(ticket.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">
                    {ticket.subject}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ticket.customerLabel ||
                      ticket.customerEmail ||
                      t.tickets.list.anonymous}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pagination footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {interp(t.tickets.list.pageOf, { page, total: totalPages })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t.common.previous}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t.common.next}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
