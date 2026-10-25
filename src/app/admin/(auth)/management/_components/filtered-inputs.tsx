"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { ArrowUpRight, ChevronDown, Globe2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, qs, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { formatSpamFilterProvider, formatSpamFilterReason, spamFilterProbabilities, summarizeSpamFilterReason } from "@/lib/spam-filter-presentation";
import type { FilteredInputItem, FilteredInputDetail } from "@/services/filtered-inputs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetadataItem, MetadataList } from "@/components/ui/metadata";
import { EmptyState, ErrorState, FormField, ManagerPanel, TableSkeleton, errorMessage, formatDateTime } from "./manager-ui";
import { ReviewImages } from "./review-images";

function InputState({ state }: { state: FilteredInputItem["state"] }) {
  const { t } = useI18n();
  return <Badge variant="secondary" className={state === "released" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}>{t.management.filteredInputs[state]}</Badge>;
}

function InputSource({ row }: { row: FilteredInputItem }) {
  const { t } = useI18n(); const m = t.management.filteredInputs;
  const Icon = row.source === "email" ? Mail : Globe2;
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Icon aria-hidden className="size-3.5 shrink-0" />{row.source === "email" ? m.email : m.web}</span>;
}

function CustomerProduct({ row }: { row: FilteredInputItem }) {
  const { t } = useI18n(); const m = t.management.filteredInputs;
  return <dl className="min-w-0 space-y-1 text-xs"><div><dt className="sr-only">{m.sender}</dt><dd className="wrap-anywhere lg:truncate" title={row.sender}>{row.sender}</dd></div><div><dt className="sr-only">{m.product}</dt><dd className="text-muted-foreground wrap-anywhere lg:truncate" title={row.productName}>{row.productName}</dd></div></dl>;
}

export function FilteredInputs({ tenantId }: { tenantId?: string }) {
  const { t, language } = useI18n(); const m = t.management.filteredInputs;
  const [page, setPage] = useState(1);
  const [state, setState] = useState("all");
  const [selected, setSelected] = useState<FilteredInputItem | null>(null);
  const { data, error, isLoading, mutate } = useSWR<{ items: FilteredInputItem[]; total: number }>(
    `/api/tob/admin/spam-filter/inputs${qs({ tenantId, page, pageSize: 20, state: state === "all" ? undefined : state })}`, swrFetcher,
  );
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  const shortTime = (value: string) => new Intl.DateTimeFormat(language, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const actions = (row: FilteredInputItem) => row.ticketId && row.ticketNumber
    ? <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs"><Link href={`/admin/tickets?ticket=${encodeURIComponent(row.ticketId)}`} aria-label={`${m.openTicket} #${row.ticketNumber}`}><span>{m.ticket} <span className="tabular-nums">#{row.ticketNumber}</span></span><ArrowUpRight aria-hidden className="size-3.5" /></Link></Button>
    : <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(row)}>{m.view}</Button>;
  return <ManagerPanel title={m.title} description={m.description} actions={<Button variant="outline" size="icon" className="size-8" aria-label={t.common.refresh} onClick={() => void mutate()}><RefreshCw className="size-3.5" /></Button>}>
    <div className="mb-4 flex items-center gap-3"><label htmlFor="filtered-state" className="text-xs font-medium">{t.common.status}</label><Select value={state} onValueChange={(value) => { setState(value); setPage(1); }}><SelectTrigger id="filtered-state" className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t.common.all}</SelectItem><SelectItem value="pending">{m.pending}</SelectItem><SelectItem value="released">{m.released}</SelectItem></SelectContent></Select></div>
    {error ? <ErrorState onRetry={() => void mutate()} /> : isLoading || !data ? <TableSkeleton columns={5} /> : !data.items.length ? <EmptyState message={m.empty} /> : <>
      <div className="hidden lg:block"><Table className="table-fixed">
        <TableHeader><TableRow><TableHead className="w-[34%]">{m.content}</TableHead><TableHead className="w-[24%]">{m.customerProduct}</TableHead><TableHead className="w-[14%]">{m.source}</TableHead><TableHead>{m.reason}</TableHead><TableHead className="w-32 text-right">{t.common.actions}</TableHead></TableRow></TableHeader>
        <TableBody>{data.items.map((row) => <TableRow key={`${row.source}:${row.id}`}>
          <TableCell className="whitespace-normal py-3 pr-5"><div className="flex items-center gap-2"><button className="truncate text-left text-sm font-medium hover:underline" title={row.subject || m.noSubject} onClick={() => setSelected(row)}>{row.subject || m.noSubject}</button><InputState state={row.state} /></div><p className="mt-1 line-clamp-1 break-words text-xs text-muted-foreground">{row.preview}</p></TableCell>
          <TableCell className="whitespace-normal py-3 pr-5"><CustomerProduct row={row} /></TableCell>
          <TableCell className="whitespace-normal py-3"><InputSource row={row} /><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)} className="mt-1 block text-xs text-muted-foreground">{shortTime(row.createdAt)}</time></TableCell>
          <TableCell className="whitespace-normal py-3 pr-4"><p className="line-clamp-2 break-words text-xs leading-relaxed">{summarizeSpamFilterReason(row.filterReason, t)}</p></TableCell>
          <TableCell className="py-3 text-right">{actions(row)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
      <div className="divide-y border-y lg:hidden">{data.items.map((row) => <article key={`${row.source}:${row.id}`} className="space-y-2.5 py-3">
        <div className="flex items-center justify-between gap-3"><InputSource row={row} /><InputState state={row.state} /></div>
        <div><button className="text-left text-sm font-medium break-words hover:underline" onClick={() => setSelected(row)}>{row.subject || m.noSubject}</button><p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground">{row.preview}</p></div>
        <CustomerProduct row={row} />
        <p className="line-clamp-2 text-xs break-words text-muted-foreground">{summarizeSpamFilterReason(row.filterReason, t)}</p>
        <div className="flex items-center justify-between gap-3"><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)} className="text-xs text-muted-foreground">{shortTime(row.createdAt)}</time>{actions(row)}</div>
      </article>)}</div>
    </>}
    {data && <div className="mt-3 flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground"><span>{data.total} {m.total}</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.common.previous}</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t.common.next}</Button></div></div>}
    {selected && <ReviewInput key={`${selected.source}:${selected.id}`} row={selected} onClose={() => setSelected(null)} onRestored={() => { void mutate(); }} />}
  </ManagerPanel>;
}

function FilterDecision({ data }: { data: FilteredInputDetail }) {
  const { t, language } = useI18n(); const m = t.management.filteredInputs;
  const probabilities = spamFilterProbabilities(data.filterReason);
  const reason = summarizeSpamFilterReason(data.filterReason, t);
  const percent = (value: number) => new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(value);
  return <section aria-label={m.reason} className="space-y-2">
    <div><h3 className="text-xs font-medium text-muted-foreground">{m.reason}</h3><p className="mt-1 text-sm font-medium leading-relaxed">{probabilities || reason.length <= 160 ? reason : m.needsReview}</p></div>
    <details className="group"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />{m.filterDetails}</summary><div className="mt-3 space-y-3">
    {probabilities ? <dl className="space-y-2 text-xs">
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{m.spamProbability}</dt><dd className="font-medium tabular-nums">{percent(probabilities.spam)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{m.supportProbability}</dt><dd className="font-medium tabular-nums">{percent(probabilities.support)}</dd></div>
    </dl> : data.filterScore !== null && <MetadataList><MetadataItem label={m.score}>{data.filterScore.toFixed(3)}</MetadataItem></MetadataList>}
    <p className="text-xs text-muted-foreground">{formatSpamFilterProvider(data.filterProvider, t)}</p>
    {!probabilities && reason.length > 160 && <p className="max-h-40 overflow-y-auto text-xs leading-relaxed wrap-anywhere">{formatSpamFilterReason(data.filterReason, m.reasons)}</p>}
    </div></details>
  </section>;
}

function SubmittedFields({ metadata }: { metadata: string }) {
  let values: unknown;
  try { values = JSON.parse(metadata); } catch { values = null; }
  if (!values || typeof values !== "object" || Array.isArray(values)) return <pre className="whitespace-pre-wrap text-xs wrap-anywhere">{metadata}</pre>;
  return <dl className="divide-y">{Object.entries(values).map(([key, value]) => <div key={key} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4"><dt className="text-muted-foreground wrap-anywhere">{key}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</dd></div>)}</dl>;
}

function ReviewInput({ row, onClose, onRestored }: { row: FilteredInputItem; onClose: () => void; onRestored: () => void }) {
  const { t } = useI18n(); const m = t.management.filteredInputs;
  const { me } = useMe(); const { mutate: refresh } = useSWRConfig();
  const url = `/api/tob/admin/spam-filter/inputs/${row.source}/${encodeURIComponent(row.id)}`;
  const { data, error, mutate } = useSWR<FilteredInputDetail>(url, swrFetcher);
  const [reason, setReason] = useState(""); const [typeId, setTypeId] = useState("");
  const [pending, setPending] = useState(false); const [failure, setFailure] = useState("");
  const [result, setResult] = useState<{ ticketId: string; ticketNumber: number } | null>(null);
  const { data: types, error: typesError, mutate: retryTypes } = useSWR<Array<{ id: string; name: string; productId: string; archivedAt: string | null; systemKey: string | null }>>(
    data?.needsTicketType && !data.releasedAt ? `/api/tob/admin/ticket-types${qs({ productId: row.productId })}` : null, swrFetcher,
  );
  const availableTypes = (types ?? []).filter((type) => type.productId === row.productId && !type.archivedAt && (!type.systemKey || type.systemKey === "unclassified"));
  const released = Boolean(data?.releasedAt || result);
  const ticketLink = result ?? (row.ticketId && row.ticketNumber ? { ticketId: row.ticketId, ticketNumber: row.ticketNumber } : null);
  const restore = async () => {
    if (!data || !reason.trim() || pending || released || Boolean(me?.preview) || (data.needsTicketType && !availableTypes.some((type) => type.id === typeId))) return;
    setPending(true); setFailure("");
    try {
      const restored = await api.post<{ ticketId: string; ticketNumber: number }>(`${url}/release`, { reason: reason.trim(), ...(data.needsTicketType ? { ticketTypeId: typeId } : {}) });
      setResult(restored); toast.success(m.success); onRestored();
      void mutate(); void refresh((key) => typeof key === "string" && (key.startsWith("/api/tob/tickets") || key.startsWith("/api/tob/dashboard") || key.startsWith("/api/tob/admin/email-logs"))).catch(() => {});
    } catch (err) { setFailure(errorMessage(err, t.management.loadFailed)); }
    finally { setPending(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" showCloseButton={!pending}>
      <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
        <div className="mb-1 flex items-center gap-3 pr-6"><InputSource row={row} /><span className="text-xs text-muted-foreground">{row.kind === "reply" ? m.reply : m.newTicket}</span><InputState state={released ? "released" : row.state} /></div>
        <DialogTitle className="pr-5 text-base leading-snug break-words">{row.subject || m.noSubject}</DialogTitle>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <MetadataList className="grid gap-1 text-xs sm:flex sm:gap-x-5"><MetadataItem label={m.sender}>{row.sender}</MetadataItem><MetadataItem label={m.product}>{row.productName}</MetadataItem></MetadataList>
          <time dateTime={row.createdAt} className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</time>
        </div>
        <DialogDescription className="sr-only">{m.reviewDetails}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto">
        {error ? <div className="p-5"><ErrorState onRetry={() => void mutate()} /></div> : !data ? <div className="p-5"><TableSkeleton columns={2} rows={3} /></div> : <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_18rem]">
          <Tabs defaultValue={data.reviewHtml ? "formatted" : "plain"} className="min-w-0 gap-0 p-4 md:p-5">
            <TabsList aria-label={m.contentView} className="mb-3 h-8 shrink-0">
              {data.reviewHtml && <TabsTrigger value="formatted" className="text-xs">{m.formatted}</TabsTrigger>}
              <TabsTrigger value="plain" className="text-xs">{data.reviewHtml ? m.plainText : m.content}</TabsTrigger>
              {data.metadata && <TabsTrigger value="fields" className="text-xs">{m.metadata}</TabsTrigger>}
            </TabsList>
            {data.reviewHtml && <TabsContent value="formatted" className="min-h-28 max-h-[min(32dvh,18rem)] flex-none overflow-y-auto overscroll-contain pr-2 text-sm leading-relaxed wrap-anywhere md:max-h-[min(45dvh,25rem)] [&_a]:underline [&_p]:my-2" tabIndex={0}><div dangerouslySetInnerHTML={{ __html: data.reviewHtml }} /></TabsContent>}
            <TabsContent value="plain" className="min-h-28 max-h-[min(32dvh,18rem)] flex-none overflow-y-auto overscroll-contain pr-2 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere md:max-h-[min(45dvh,25rem)]" tabIndex={0}>{data.content || "—"}</TabsContent>
            {data.metadata && <TabsContent value="fields" className="min-h-28 max-h-[min(32dvh,18rem)] flex-none overflow-y-auto overscroll-contain pr-2 md:max-h-[min(45dvh,25rem)]" tabIndex={0}><SubmittedFields metadata={data.metadata} /></TabsContent>}
            <ReviewImages images={data.reviewImages ?? []} />
          </Tabs>
          <aside className="min-w-0 space-y-5 border-t bg-muted/20 p-4 md:border-t-0 md:border-l md:p-5">
            <FilterDecision data={data} />
            {released ? <section className="space-y-3 border-t pt-4"><h3 className="text-sm font-medium">{m.restorationDetails}</h3><MetadataList className="grid gap-2">{data.releasedAt && <MetadataItem label={m.restoredAt}>{formatDateTime(data.releasedAt)}</MetadataItem>}{data.releasedByName && <MetadataItem label={m.restoredBy}>{data.releasedByName}</MetadataItem>}</MetadataList><div><p className="mb-1 text-xs text-muted-foreground">{m.releaseReason}</p><p className="max-h-32 overflow-y-auto text-sm whitespace-pre-wrap wrap-anywhere">{data.releaseReason ?? reason}</p></div></section> : <section className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">{m.restoreSection}</h3>
              {data.needsTicketType && <FormField label={m.ticketType} htmlFor="restore-type" required>{typesError ? <ErrorState message={m.typeLoadFailed} onRetry={() => void retryTypes()} /> : <Select value={typeId} onValueChange={setTypeId} disabled={pending || Boolean(me?.preview) || !availableTypes.length}><SelectTrigger id="restore-type" className="w-full"><SelectValue placeholder={!types ? t.common.loading : availableTypes.length ? m.selectType : m.noTypes} /></SelectTrigger><SelectContent>{availableTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select>}</FormField>}
              <FormField label={m.releaseReason} htmlFor="restore-reason" required><Textarea id="restore-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} className="min-h-20 max-h-32" disabled={pending || Boolean(me?.preview)} /></FormField>
              <p className="text-xs leading-relaxed text-muted-foreground">{row.kind === "reply" ? m.replyNotice : m.restoreNotice}</p>
            </section>}
          </aside>
        </div>}
      </div>
      <div className="shrink-0 border-t bg-background px-4 py-3">
        {failure && <p role="alert" className="mb-3 text-sm text-destructive">{failure}</p>}
        <DialogFooter className="flex-row justify-end"><Button variant="outline" onClick={onClose} disabled={pending}>{t.common.close}</Button>{released ? ticketLink && <Button asChild><Link href={`/admin/tickets?ticket=${encodeURIComponent(ticketLink.ticketId)}`}>{m.openTicket} <span className="tabular-nums">#{ticketLink.ticketNumber}</span><ArrowUpRight aria-hidden className="size-4" /></Link></Button> : <Button onClick={() => void restore()} disabled={!data || !!error || pending || !reason.trim() || !me || Boolean(me.preview) || row.state === "releasing" || (data.needsTicketType && !availableTypes.some((type) => type.id === typeId))}>{pending ? t.common.loading : row.kind === "reply" ? m.restoreReply : m.restore}</Button>}</DialogFooter>
      </div>
    </DialogContent>
  </Dialog>;
}
