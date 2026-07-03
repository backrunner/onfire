"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Inbox, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { tocApi, ApiClientError } from "@/lib/api/toc-client";
import { qs } from "@/lib/api/client";
import { formatRelativeTime, type TocTicket, type TocTicketPage } from "@/lib/toc/portal";
import { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TocStatusBadge } from "./status-badge";

const PAGE_SIZE = 10;

const STATUS_FILTERS: (TicketStatus | "all")[] = [
  "all",
  TicketStatus.New,
  TicketStatus.Processing,
  TicketStatus.Replied,
  TicketStatus.Escalated,
  TicketStatus.Closed,
];

interface TicketListProps {
  onSelect: (ticketId: string) => void;
}

interface ListState {
  items: TocTicket[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
}

const initialState: ListState = {
  items: [],
  total: 0,
  page: 1,
  loading: true,
  loadingMore: false,
  error: false,
};

export function TicketList({ onSelect }: TicketListProps) {
  const { t, language } = useI18n();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [state, setState] = useState<ListState>(initialState);

  const fetchPage = useCallback(
    async (status: TicketStatus | "all", page: number, append: boolean) => {
      setState((prev) => ({
        ...prev,
        loading: !append,
        loadingMore: append,
        error: false,
        ...(append ? {} : { items: [], page: 1 }),
      }));
      try {
        const data = await tocApi.get<TocTicketPage>(
          `/api/toc/tickets${qs({
            status: status === "all" ? undefined : status,
            page,
            pageSize: PAGE_SIZE,
          })}`
        );
        setState((prev) => ({
          items: append ? [...prev.items, ...data.items] : data.items,
          total: data.total,
          page: data.page,
          loading: false,
          loadingMore: false,
          error: false,
        }));
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: !append,
        }));
      }
    },
    []
  );

  useEffect(() => {
    void fetchPage(statusFilter, 1, false);
  }, [statusFilter, fetchPage]);

  const hasMore = state.items.length < state.total;
  const filterLabel = (status: TicketStatus | "all") =>
    status === "all" ? t.toc.list.filterAll : t.tickets.status[status];

  return (
    <div className="space-y-4">
      {/* Status filter chips + refresh */}
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === status
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {filterLabel(status)}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => void fetchPage(statusFilter, 1, false)}
          disabled={state.loading}
          aria-label={t.toc.list.refresh}
          title={t.toc.list.refresh}
        >
          <RefreshCw className={cn("size-4", state.loading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      {state.loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : state.error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">{t.toc.errors.loadFailed}</p>
            <p className="text-sm text-muted-foreground">
              {t.toc.errors.loadFailedMessage}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPage(statusFilter, 1, false)}
            >
              {t.toc.errors.retry}
            </Button>
          </CardContent>
        </Card>
      ) : state.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground/50" />
            <p className="font-medium">
              {statusFilter === "all"
                ? t.toc.list.noTickets
                : t.toc.list.noTicketsFiltered}
            </p>
            {statusFilter === "all" && (
              <p className="text-sm text-muted-foreground">
                {t.toc.list.noTicketsHint}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {state.items.map((ticket) => (
              <li key={ticket.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer py-0 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onSelect(ticket.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(ticket.id);
                    }
                  }}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                          {ticket.subject}
                        </h3>
                        <TocStatusBadge status={ticket.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">#{ticket.id.slice(-8)}</span>
                        <span className="mx-1.5">·</span>
                        {t.toc.list.updated}{" "}
                        {formatRelativeTime(ticket.updatedAt, language)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={state.loadingMore}
                onClick={() =>
                  void fetchPage(statusFilter, state.page + 1, true)
                }
              >
                {state.loadingMore && <Loader2 className="size-4 animate-spin" />}
                {t.toc.list.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
