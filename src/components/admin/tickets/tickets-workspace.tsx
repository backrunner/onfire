"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { MousePointerClick } from "lucide-react";
import dynamic from "next/dynamic";
import { ticketsListKey } from "@/lib/tickets/list-key";
import { swrFetcher } from "@/lib/api/client";
import type { Paginated, TicketSummary } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TicketFiltersBar,
  type TicketFilters,
} from "@/components/admin/tickets/ticket-filters";
import { TicketList } from "@/components/admin/tickets/ticket-list";
const TicketDetail = dynamic(() => import("./ticket-detail").then((m) => m.TicketDetail), { loading: () => <Skeleton className="m-4 h-40" /> });
const BulkBar = dynamic(() => import("./bulk-bar").then((m) => m.BulkBar));

/**
 * Split-view ticket workspace. All filter/selection state lives in the URL
 * (?status=&priority=&product=&team=&overdue=&q=&page=&ticket=) so views are
 * shareable; on mobile the panes stack and the detail takes over full width.
 */
export function TicketsWorkspace({ initialKey, initialData }: { initialKey: string; initialData?: Paginated<TicketSummary> }) {
  const selectedNumbers = useRef<Record<string, number>>({});
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  const filters: TicketFilters = useMemo(
    () => ({
      status: searchParams.get("status") ?? "",
      priority: searchParams.get("priority") ?? "",
      productId: searchParams.get("product") ?? "",
      teamId: searchParams.get("team") ?? "",
      overdue: searchParams.get("overdue") === "true",
      q: searchParams.get("q") ?? "",
    }),
    [searchParams]
  );
  const ticketId = searchParams.get("ticket");

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      // These parameters drive client-side SWR reads; no server navigation is needed.
      window.history.replaceState(null, "", `${pathname}${search ? `?${search}` : ""}`);
    },
    [pathname, searchParams]
  );

  const applyFilters = useCallback(
    (patch: Partial<TicketFilters>) => {
      setSelection(new Set());
      setParams({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.productId !== undefined ? { product: patch.productId } : {}),
        ...(patch.teamId !== undefined ? { team: patch.teamId } : {}),
        ...(patch.overdue !== undefined
          ? { overdue: patch.overdue ? "true" : null }
          : {}),
        ...(patch.q !== undefined ? { q: patch.q } : {}),
        page: null, // filter changes reset pagination
      });
    },
    [setParams]
  );

  const listKey = ticketsListKey(searchParams);

  const { data, error, isLoading, mutate } = useSWR<Paginated<TicketSummary>>(
    listKey,
    swrFetcher,
    { keepPreviousData: true, fallbackData: listKey === initialKey ? initialData : undefined }
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    const ticket = data?.items.find(ticket => ticket.id === id);
    if (ticket) selectedNumbers.current[id] = ticket.number;
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [data?.items]);

  const toggleAll = useCallback(
    (checked: boolean) => {
      for (const ticket of data?.items ?? []) selectedNumbers.current[ticket.id] = ticket.number;
      const ids = data?.items.map((i) => i.id) ?? [];
      setSelection((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [data]
  );

  return (
    <div className="flex h-[calc(100vh-var(--admin-chrome-h,3.5rem)-2rem)] flex-col gap-3 lg:h-[calc(100vh-var(--admin-chrome-h,3.5rem)-3rem)]">
      <TicketFiltersBar value={filters} onChange={applyFilters} />

      {selection.size > 0 && (
        <BulkBar
          selectedIds={[...selection]}
          ticketNumbers={selectedNumbers.current}
          onClear={() => setSelection(new Set())}
          onDone={() => void mutate()}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* List pane */}
        <div
          className={cn(
            "flex w-full min-w-0 flex-col lg:w-[400px] lg:shrink-0 lg:border-r lg:border-border",
            ticketId && "hidden lg:flex"
          )}
        >
          <TicketList
            data={data}
            isLoading={isLoading}
            error={error as Error | undefined}
            onRetry={() => void mutate()}
            selectedId={ticketId}
            onSelect={(id) => setParams({ ticket: id })}
            selection={selection}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            onPageChange={(next) => setParams({ page: String(next) })}
          />
        </div>

        {/* Detail pane */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            !ticketId && "hidden lg:block"
          )}
        >
          {ticketId ? (
            <TicketDetail
              key={ticketId}
              ticketId={ticketId}
              onBack={() => setParams({ ticket: null })}
              backOnlyMobile
              onMutated={() => void mutate()}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <MousePointerClick className="size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {t.tickets.detail.selectTicket}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.tickets.detail.selectTicketHint}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
