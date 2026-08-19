"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { MousePointerClick } from "lucide-react";
import { swrFetcher, qs } from "@/lib/api/client";
import type { Paginated, TicketView } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TicketFiltersBar,
  type TicketFilters,
} from "@/components/admin/tickets/ticket-filters";
import { TicketList } from "@/components/admin/tickets/ticket-list";
import { TicketDetail } from "@/components/admin/tickets/ticket-detail";
import { BulkBar } from "@/components/admin/tickets/bulk-bar";

const PAGE_SIZE = 25;

export default function AdminTicketsPage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <TicketsWorkspace />
    </Suspense>
  );
}

/**
 * Split-view ticket workspace. All filter/selection state lives in the URL
 * (?status=&priority=&product=&team=&overdue=&q=&page=&ticket=) so views are
 * shareable; on mobile the panes stack and the detail takes over full width.
 */
function TicketsWorkspace() {
  const { t } = useI18n();
  const router = useRouter();
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
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const ticketId = searchParams.get("ticket");

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      router.replace(`${pathname}${search ? `?${search}` : ""}`, {
        scroll: false,
      });
    },
    [router, pathname, searchParams]
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

  const listKey = `/api/tob/tickets${qs({
    status: filters.status,
    priority: filters.priority,
    productId: filters.productId,
    teamId: filters.teamId,
    overdue: filters.overdue ? "true" : "",
    q: filters.q,
    page,
    pageSize: PAGE_SIZE,
  })}`;

  const { data, error, isLoading, mutate } = useSWR<Paginated<TicketView>>(
    listKey,
    swrFetcher,
    { keepPreviousData: true }
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
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

function WorkspaceSkeleton() {
  return (
    <div
      className="flex h-[calc(100vh-var(--admin-chrome-h,3.5rem)-2rem)] flex-col gap-3 lg:h-[calc(100vh-var(--admin-chrome-h,3.5rem)-3rem)]"
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 min-w-[180px] flex-1" />
        <Skeleton className="h-8 w-[120px]" />
        <Skeleton className="h-8 w-[120px]" />
        <Skeleton className="h-8 w-[140px]" />
        <Skeleton className="h-8 w-[140px]" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <div className="flex w-full min-w-0 flex-col lg:w-[400px] lg:shrink-0 lg:border-r lg:border-border">
          <div className="flex h-[29px] shrink-0 items-center gap-2 border-b border-border px-3">
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3">
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex min-h-[81px] items-start gap-2 px-0.5 py-2">
                  <Skeleton className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-14" />
                      <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-3">
            <Skeleton className="h-3 w-16" />
            <div className="flex gap-1">
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
            </div>
          </div>
        </div>
        <div className="hidden flex-1 p-4 lg:block">
          <div className="space-y-3 border-b pb-4">
            <Skeleton className="h-5 w-2/3" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-3 w-20 max-w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
          <Skeleton className="mt-4 h-40 w-full" />
          <Skeleton className="mt-4 h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
