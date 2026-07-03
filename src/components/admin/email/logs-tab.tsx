"use client";

import { useState, Fragment } from "react";
import useSWR from "swr";
import { AlertTriangle, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher, qs } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PaginationBar } from "@/components/admin/pagination-bar";
import type { InboundEmailLog, OutboundEmailLog } from "./types";

const PAGE_SIZE = 25;

const badgeBase =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap";

const LOG_STATUS_STYLES: Record<string, string> = {
  processed: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  sent: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  delivered: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  filtered: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  error: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  failed: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  bounced: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  pending: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400",
};

function LogStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const statuses = t.emailConfig.logs.statuses as Record<string, string>;
  return (
    <span
      className={cn(
        badgeBase,
        LOG_STATUS_STYLES[status] ?? LOG_STATUS_STYLES.pending
      )}
    >
      {statuses[status] ?? status}
    </span>
  );
}

export function EmailLogsTab({ productId }: { productId: string }) {
  const { t } = useI18n();
  return (
    <Tabs defaultValue="inbound">
      <TabsList className="h-8">
        <TabsTrigger value="inbound" className="text-xs">
          {t.emailConfig.logs.inbound}
        </TabsTrigger>
        <TabsTrigger value="outbound" className="text-xs">
          {t.emailConfig.logs.outbound}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inbound" className="mt-3">
        <InboundLogsTable productId={productId} />
      </TabsContent>
      <TabsContent value="outbound" className="mt-3">
        <OutboundLogsTable productId={productId} />
      </TabsContent>
    </Tabs>
  );
}

function LogsShell({
  error,
  isLoading,
  isEmpty,
  onRetry,
  children,
}: {
  error: unknown;
  isLoading: boolean;
  isEmpty: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="pt-6">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
            <p className="text-sm text-muted-foreground">
              {t.emailConfig.logs.loadFailed}
            </p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t.emailConfig.retry}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center">
            <Inbox className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t.emailConfig.logs.empty}</p>
            <p className="text-xs text-muted-foreground">
              {t.emailConfig.logs.emptyHint}
            </p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function ErrorToggleCell({
  expanded,
  hasError,
  onToggle,
}: {
  expanded: boolean;
  hasError: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  if (!hasError) return <TableCell />;
  return (
    <TableCell>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-[11px] text-red-600 dark:text-red-400"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="mr-0.5 size-3" />
        ) : (
          <ChevronRight className="mr-0.5 size-3" />
        )}
        {expanded ? t.emailConfig.logs.hideError : t.emailConfig.logs.showError}
      </Button>
    </TableCell>
  );
}

function ErrorRow({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-2">
        <p className="whitespace-pre-wrap break-all rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          {message}
        </p>
      </TableCell>
    </TableRow>
  );
}

function InboundLogsTable({ productId }: { productId: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<Paginated<InboundEmailLog>>(
    `/api/tob/admin/email-logs/inbound${qs({ productId, page, pageSize: PAGE_SIZE })}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <LogsShell
      error={error}
      isLoading={isLoading && !data}
      isEmpty={!data || data.items.length === 0}
      onRetry={() => mutate()}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.emailConfig.logs.from}</TableHead>
            <TableHead>{t.emailConfig.logs.subject}</TableHead>
            <TableHead className="w-24">{t.emailConfig.logs.status}</TableHead>
            <TableHead className="w-36">{t.emailConfig.logs.time}</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.items ?? []).map((log) => (
            <Fragment key={log.id}>
              <TableRow>
                <TableCell className="max-w-44 truncate text-sm">
                  {log.fromEmail}
                </TableCell>
                <TableCell className="max-w-0 truncate text-sm text-muted-foreground">
                  {log.subject || "—"}
                </TableCell>
                <TableCell>
                  <LogStatusBadge status={log.processingStatus} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
                <ErrorToggleCell
                  hasError={Boolean(log.errorMessage)}
                  expanded={expanded === log.id}
                  onToggle={() =>
                    setExpanded(expanded === log.id ? null : log.id)
                  }
                />
              </TableRow>
              {expanded === log.id && log.errorMessage && (
                <ErrorRow message={log.errorMessage} colSpan={5} />
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <PaginationBar
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-4"
      />
    </LogsShell>
  );
}

function OutboundLogsTable({ productId }: { productId: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<Paginated<OutboundEmailLog>>(
    `/api/tob/admin/email-logs/outbound${qs({ productId, page, pageSize: PAGE_SIZE })}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <LogsShell
      error={error}
      isLoading={isLoading && !data}
      isEmpty={!data || data.items.length === 0}
      onRetry={() => mutate()}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.emailConfig.logs.to}</TableHead>
            <TableHead>{t.emailConfig.logs.subject}</TableHead>
            <TableHead className="w-24">
              {t.emailConfig.logs.provider}
            </TableHead>
            <TableHead className="w-24">{t.emailConfig.logs.status}</TableHead>
            <TableHead className="w-36">{t.emailConfig.logs.time}</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.items ?? []).map((log) => (
            <Fragment key={log.id}>
              <TableRow>
                <TableCell className="max-w-44 truncate text-sm">
                  {log.toEmail}
                </TableCell>
                <TableCell className="max-w-0 truncate text-sm text-muted-foreground">
                  {log.subject}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {log.provider || "—"}
                </TableCell>
                <TableCell>
                  <LogStatusBadge status={log.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
                <ErrorToggleCell
                  hasError={Boolean(log.errorMessage)}
                  expanded={expanded === log.id}
                  onToggle={() =>
                    setExpanded(expanded === log.id ? null : log.id)
                  }
                />
              </TableRow>
              {expanded === log.id && log.errorMessage && (
                <ErrorRow message={log.errorMessage} colSpan={6} />
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <PaginationBar
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-4"
      />
    </LogsShell>
  );
}
