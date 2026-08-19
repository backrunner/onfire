"use client";

import { useState, Fragment } from "react";
import useSWR from "swr";
import { AlertTriangle, ChevronDown, ChevronRight, Inbox, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/admin/loading-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  quarantined: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  releasing: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
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
  columns,
  onRetry,
  children,
}: {
  error: unknown;
  isLoading: boolean;
  isEmpty: boolean;
  columns: number;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="py-0">
      <CardContent className="py-4">
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
          <TableSkeleton rows={6} columns={columns} rowClassName="h-10" />
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
  const [releasing, setReleasing] = useState<InboundEmailLog | null>(null);
  const [releaseTypeId, setReleaseTypeId] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [releasePending, setReleasePending] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<Paginated<InboundEmailLog>>(
    `/api/tob/admin/email-logs/inbound${qs({ productId, page, pageSize: PAGE_SIZE })}`,
    swrFetcher,
    { keepPreviousData: true }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const { data: typeRows } = useSWR<Array<{
    id: string;
    productId: string;
    name: string;
    systemKey: string | null;
    archivedAt: string | null;
  }>>(releasing ? "/api/tob/admin/ticket-types" : null, swrFetcher);
  const releaseTypes = (typeRows ?? []).filter(
    (type) =>
      type.productId === productId &&
      !type.archivedAt &&
      (!type.systemKey || type.systemKey === "unclassified")
  );
  const release = async () => {
    if (!releasing || !releaseReason.trim() || (!releasing.candidateTicketId && !releaseTypeId)) return;
    setReleasePending(true);
    try {
      await api.post(`/api/tob/admin/email-logs/inbound/${releasing.id}/release`, {
        ...(releaseTypeId ? { ticketTypeId: releaseTypeId } : {}),
        reason: releaseReason.trim(),
      });
      toast.success(t.emailConfig.logs.released);
      setReleasing(null);
      setReleaseReason("");
      setReleaseTypeId("");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.emailConfig.logs.releaseFailed);
    } finally {
      setReleasePending(false);
    }
  };

  return (
    <LogsShell
      error={error}
      isLoading={isLoading && !data}
      isEmpty={!data || data.items.length === 0}
      columns={5}
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
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <ErrorToggleCell
                  hasError={Boolean(log.errorMessage || log.filterReason)}
                  expanded={expanded === log.id}
                  onToggle={() =>
                    setExpanded(expanded === log.id ? null : log.id)
                  }
                />
              </TableRow>
              {expanded === log.id && (log.errorMessage || log.filterReason) && (
                <ErrorRow message={log.errorMessage || log.filterReason || ""} colSpan={5} />
              )}
              {log.processingStatus === "quarantined" && !log.releasedAt && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-1 text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { setReleasing(log); setReleaseTypeId(""); setReleaseReason(""); }}>
                      <RotateCcw className="mr-1.5 size-3.5" />{t.emailConfig.logs.release}
                    </Button>
                  </TableCell>
                </TableRow>
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
      <Dialog open={Boolean(releasing)} onOpenChange={(open) => !releasePending && !open && setReleasing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t.emailConfig.logs.release}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={releaseTypeId} onValueChange={setReleaseTypeId}>
              <SelectTrigger><SelectValue placeholder={t.emailConfig.logs.selectReleaseType} /></SelectTrigger>
              <SelectContent>{releaseTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.systemKey === "unclassified" ? t.emailConfig.logs.unclassified : type.name}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} placeholder={t.emailConfig.logs.releaseReason} rows={3} />
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setReleasing(null)} disabled={releasePending}>{t.common.cancel}</Button><Button size="sm" onClick={() => void release()} disabled={releasePending || !releaseReason.trim() || (!releasing?.candidateTicketId && !releaseTypeId)}>{releasePending ? t.common.loading : t.emailConfig.logs.release}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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
      columns={6}
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
                  {formatDateTime(log.createdAt)}
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
