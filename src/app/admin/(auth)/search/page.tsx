"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { swrFetcher, qs } from "@/lib/api/client";
import { TicketStatus, TicketPriority } from "@/lib/types";
import {
  StatusBadge,
  PriorityBadge,
  SlaBadge,
} from "@/components/admin/status-badges";
import { ProductSelect, ALL_PRODUCTS } from "@/components/admin/product-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  productName: string;
  teamName: string;
  isOverdue: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface SearchResponse {
  tickets: SearchTicket[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const ALL = "__all__";

export default function AdminSearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const productId = searchParams.get("product") ?? "";
  const overdue = searchParams.get("overdue") === "true";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => inputRef.current?.focus(), []);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Debounced keyword → URL
  useEffect(() => {
    if (draft === q) return;
    const handle = setTimeout(
      () => setParams({ q: draft, page: null }),
      350
    );
    return () => clearTimeout(handle);
  }, [draft, q, setParams]);

  const hasCriteria = Boolean(q || status || priority || productId || overdue);

  const key = hasCriteria
    ? `/api/tob/search${qs({
        q,
        status,
        priority,
        productId,
        overdue: overdue ? "true" : "",
        page,
        pageSize: 20,
      })}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<SearchResponse>(key, swrFetcher, {
    keepPreviousData: true,
  });

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [language]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t.search.title}</h1>
        <p className="text-sm text-muted-foreground">{t.search.subtitle}</p>
      </div>

      {/* Search bar + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.search.keywordPlaceholder}
            className="h-10 pl-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status || ALL}
            onValueChange={(v) => setParams({ status: v === ALL ? null : v, page: null })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t.common.all} · {t.common.status}
              </SelectItem>
              {Object.values(TicketStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {t.tickets.status[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priority || ALL}
            onValueChange={(v) => setParams({ priority: v === ALL ? null : v, page: null })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t.common.all} · {t.common.priority}
              </SelectItem>
              {Object.values(TicketPriority).map((p) => (
                <SelectItem key={p} value={p}>
                  {t.tickets.priority[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ProductSelect
            value={productId}
            onChange={(v) =>
              setParams({ product: v === ALL_PRODUCTS ? null : v, page: null })
            }
            placeholder={t.common.all}
            allLabel={t.common.all}
            className="h-8 w-[160px] text-xs"
          />

          <Button
            variant={overdue ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setParams({ overdue: overdue ? null : "true", page: null })}
          >
            <AlertTriangle className="size-3.5" />
            {t.dashboard.viewOverdue}
          </Button>
        </div>
      </div>

      {/* Results */}
      {!hasCriteria ? (
        <EmptyHint
          icon={<Search className="size-8 text-muted-foreground/40" />}
          title={t.search.keyword}
          hint={t.search.keywordPlaceholder}
        />
      ) : isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">{t.tickets.list.loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RefreshCw className="size-4" />
            {t.tickets.list.retry}
          </Button>
        </div>
      ) : (data?.tickets.length ?? 0) === 0 ? (
        <EmptyHint
          icon={<SearchX className="size-8 text-muted-foreground/40" />}
          title={t.search.noResults}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {data!.pagination.total} {t.search.found}
          </p>
          <div className="space-y-2">
            {data!.tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/admin/tickets?ticket=${ticket.id}`}
                className={cn(
                  "block rounded-lg border border-border bg-card px-4 py-3 transition-colors",
                  "hover:border-border hover:bg-accent/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                  <SlaBadge breached={Boolean(ticket.isOverdue)} />
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(ticket.createdAt))}
                  </span>
                </div>
                <div className="mt-1.5 truncate text-sm font-medium">
                  {ticket.subject}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="truncate">{ticket.customerEmail}</span>
                  {ticket.productName && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{ticket.productName}</span>
                    </>
                  )}
                  {ticket.teamName && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{ticket.teamName}</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {data!.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                {t.search.page} {data!.pagination.page} / {data!.pagination.totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: String(page - 1) })}
                  aria-label={t.common.previous}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page >= data!.pagination.totalPages}
                  onClick={() => setParams({ page: String(page + 1) })}
                  aria-label={t.common.next}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyHint({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-16 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-32" />
        ))}
      </div>
    </div>
  );
}
