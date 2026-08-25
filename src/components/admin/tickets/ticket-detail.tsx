"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Bot, Clock, ExternalLink, SearchX, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher, ApiClientError } from "@/lib/api/client";
import type { TicketDetailResponse } from "@/lib/api/types";
import { TicketStatus } from "@/lib/types";
import { localizeFormSchema, type FormSchema } from "@/lib/form-schema";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  StatusBadge,
  PriorityBadge,
  SlaBadge,
} from "@/components/admin/status-badges";
import { TicketActions } from "./ticket-actions";
import { Timeline } from "./timeline";
import { ReplyComposer } from "./reply-composer";
import { AssistantPanel } from "./assistant-panel";
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
  const [assistantOpen, setAssistantOpen] = useState(false);
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
  const customerLabel =
    ticket.customerLabel || ticket.customerEmail || t.tickets.list.anonymous;
  const ticketTypeLabel = Array.isArray(ticket.ticketTypePath)
    ? ticket.ticketTypePath.map((item) => item.name).join(" / ")
    : "—";

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
            {ticket.originalSubject && ticket.originalSubject !== ticket.subject && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={ticket.originalSubject}>
                {t.tickets.detail.original}: {ticket.originalSubject}
              </p>
            )}
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
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setAssistantOpen(true)}
            aria-label={t.tickets.assistant.title}
            title={t.tickets.assistant.title}
          >
            <Bot />
          </Button>
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

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-5">
          <Meta label={t.tickets.detail.ticketType} value={ticketTypeLabel} />
          <Meta
            icon={<User className="size-3" />}
            label={t.tickets.detail.customer}
            value={customerLabel}
          />
          <Meta
            label={t.tickets.detail.assignee}
            value={
              ticket.assigneeName ??
              (ticket.assigneeId ? "—" : t.tickets.list.unassigned)
            }
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

        <AiInsights ticket={ticket} />

        <InternalStateControls
          ticketId={ticket.id}
          states={data.internalStates ?? []}
          onMutated={refresh}
        />

        <TicketActions
          ticket={ticket}
          hasAgentReply={timeline.some(
            (entry) =>
              entry.type === "reply" && Boolean(entry.senderId) && !entry.internal
          )}
          onMutated={refresh}
        />
      </div>

      {/* Scrollable conversation */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {t.tickets.detail.content} · {customerLabel}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {ticket.content}
          </p>
          {ticket.originalContent && ticket.originalContent !== ticket.content && (
            <details className="mt-2 border-t border-border/70 pt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {t.tickets.detail.showOriginal}
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-foreground/80">
                {ticket.originalContent}
              </p>
            </details>
          )}
        </div>
        <HistoricalFields
          metadata={ticket.metadata}
          schema={data.templateVersion?.formSchema}
          version={data.templateVersion?.version}
        />
        <Separator className="my-4" />
        <Timeline entries={timeline} actors={data.actors} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <ReplyComposer
          ticketId={ticket.id}
          closed={isClosed}
          suggestion={ticket.aiSuggestedReply}
          onSent={refresh}
        />
      </div>

      <AssistantPanel
        ticketId={ticket.id}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
      />
    </div>
  );
}

function InternalStateControls({
  ticketId,
  states,
  onMutated,
}: {
  ticketId: string;
  states: TicketDetailResponse["internalStates"];
  onMutated: () => void;
}) {
  const unsetValue = "__onfire_internal_state_unset__";
  const { t } = useI18n();
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (states.length === 0) return null;
  const update = async (stateId: string, value: boolean | string | null) => {
    setPendingId(stateId);
    try {
      await api.patch(`/api/tob/tickets/${ticketId}/internal-states`, { stateId, value });
      toast.success(t.tickets.detail.internalStateSaved);
      onMutated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.tickets.detail.internalStateFailed);
    } finally {
      setPendingId(null);
    }
  };
  return (
    <div className="border-y border-border/70 py-2.5">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
        {t.tickets.detail.internalStates}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {states.map((state) => {
          const disabled = Boolean(state.archivedAt) || pendingId === state.id;
          return (
            <div key={state.id} className="flex min-h-9 items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium" title={state.name}>{state.name}</p>
                {state.archivedAt && <p className="text-[10px] text-muted-foreground">{t.tickets.detail.internalStateArchived}</p>}
              </div>
              {state.kind === "boolean" ? (
                <Switch
                  checked={state.value === "true"}
                  disabled={disabled}
                  aria-label={state.name}
                  onCheckedChange={(checked) => void update(state.id, checked)}
                />
              ) : (
                <Select
                  value={state.value === null ? unsetValue : `value:${encodeURIComponent(state.value)}`}
                  disabled={disabled}
                  onValueChange={(value) => void update(
                    state.id,
                    value === unsetValue ? null : decodeURIComponent(value.slice("value:".length))
                  )}
                >
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={unsetValue}>{t.tickets.detail.internalStateUnset}</SelectItem>
                    {state.options.map((option) => (
                      <SelectItem key={option} value={`value:${encodeURIComponent(option)}`}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoricalFields({
  metadata,
  schema,
  version,
}: {
  metadata: unknown;
  schema?: FormSchema | null;
  version?: number;
}) {
  const { t, language } = useI18n();
  if (!metadata || typeof metadata !== "object" || !Array.isArray(schema?.fields)) {
    return null;
  }
  // Labels are projected into the agent's UI language; missing translations
  // fall back to the product default-language text stored on the base fields.
  const localized = localizeFormSchema(schema, language);
  const values = metadata as Record<string, unknown>;
  const fields = localized.fields.filter((field) => values[field.key] !== undefined);
  if (fields.length === 0) return null;
  const display = (value: unknown) => {
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? t.common.yes : t.common.no;
    if (value === null) return "—";
    return String(value);
  };
  return (
    <div className="mt-3 rounded-md border border-border px-3 py-2">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
        {t.tickets.detail.submittedFields}
        {version ? ` · v${version}` : ""}
      </p>
      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="min-w-0">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="break-words text-foreground">{display(values[field.key])}</dd>
          </div>
        ))}
      </dl>
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
      <span className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground/70">
        {icon}
        {label}
      </span>
      <p className="truncate text-foreground/90" title={value}>
        {value}
      </p>
    </div>
  );
}

interface ScreeningResult {
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "low" | "medium" | "high";
}

/** Compact prescreening summary; rendered only when the AI analysis exists. */
function AiInsights({
  ticket,
}: {
  ticket: TicketDetailResponse["ticket"];
}) {
  const { t } = useI18n();
  if (ticket.aiScreeningStatus !== "completed") return null;
  const result = ticket.aiScreeningResult;
  if (!result || typeof result !== "object") return null;
  const r = result as ScreeningResult;
  if (!r.summary) return null;

  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground/80">
          {t.tickets.detail.aiSummary}
        </span>
        {" · "}
        {r.summary}
      </p>
      <span className="flex shrink-0 items-center gap-1">
        {r.sentiment && r.sentiment !== "neutral" && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              r.sentiment === "negative"
                ? "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400"
                : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
            )}
          >
            {t.tickets.detail.aiSentiment[r.sentiment]}
          </span>
        )}
        {r.urgency === "high" && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
            {t.tickets.detail.aiUrgent}
          </span>
        )}
      </span>
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
    <div className="flex h-full flex-col" aria-hidden="true">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <Skeleton className="size-8 shrink-0" />
          <Skeleton className="h-5 min-w-0 flex-1" />
          <Skeleton className="size-8 shrink-0" />
          <Skeleton className="size-8 shrink-0" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-14" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-3 w-20 max-w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-8 w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-16 w-2/3" />
        <Skeleton className="h-12 w-1/2" />
      </div>
      <div className="border-t border-border p-3">
        <div className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-24 w-full" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
