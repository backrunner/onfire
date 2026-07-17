"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  BellOff,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError, qs, swrFetcher } from "@/lib/api/client";
import { ProductSelect, useProducts } from "@/components/admin/product-select";
import {
  type NotificationComplianceView,
  type NotificationRequirementView,
  type NotificationRuleView,
} from "@/components/admin/notifications/channel-meta";
import { RuleDialog } from "@/components/admin/notifications/rule-dialog";
import { RequirementDialog } from "@/components/admin/notifications/requirement-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TabValue = "rules" | "requirements" | "compliance";
type DeleteTarget = {
  kind: "rule" | "requirement";
  id: string;
  name: string;
};

export default function AdminNotificationsPage() {
  const { t } = useI18n();
  const { data: products, isLoading: productsLoading } = useProducts();
  const [productId, setProductId] = useState("");
  const [tab, setTab] = useState<TabValue>("rules");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRuleView | null>(null);
  const [editingRequirement, setEditingRequirement] =
    useState<NotificationRequirementView | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [busyPolicyIds, setBusyPolicyIds] = useState<Set<string>>(new Set());

  const rulesKey = productId
    ? `/api/tob/admin/notification-rules${qs({ productId })}`
    : null;
  const requirementsKey = productId
    ? `/api/tob/admin/notification-requirements${qs({ productId })}`
    : null;
  const complianceKey = productId
    ? `/api/tob/admin/notification-compliance${qs({ productId })}`
    : null;
  const rulesState = useSWR<NotificationRuleView[]>(rulesKey, swrFetcher);
  const requirementsState = useSWR<NotificationRequirementView[]>(
    requirementsKey,
    swrFetcher
  );
  const complianceState = useSWR<NotificationComplianceView>(
    complianceKey,
    swrFetcher
  );

  const noProducts = !productsLoading && (products?.length ?? 0) === 0;
  const teams = complianceState.data?.teams ?? [];
  const agents = complianceState.data?.agents ?? [];
  const metadataReady = Boolean(complianceState.data);
  const teamName = (id: string | null) =>
    teams.find((team) => team.id === id)?.name ?? t.notifChannels.unknownTarget;
  const agentName = (id: string | null) =>
    agents.find((agent) => agent.userId === id)?.displayName ??
    t.notifChannels.unknownTarget;

  const mutateAll = () => {
    void rulesState.mutate();
    void requirementsState.mutate();
    void complianceState.mutate();
  };

  const toggleRule = async (rule: NotificationRuleView, enabled: boolean) => {
    setBusyPolicyIds((current) => new Set(current).add(rule.id));
    try {
      await api.patch(`/api/tob/admin/notification-rules/${rule.id}`, { enabled });
      mutateAll();
    } catch (error) {
      showError(error, t.notifChannels.actionFailed);
    } finally {
      setBusyPolicyIds((current) => withoutValue(current, rule.id));
    }
  };

  const toggleRequirement = async (
    requirement: NotificationRequirementView,
    enabled: boolean
  ) => {
    setBusyPolicyIds((current) => new Set(current).add(requirement.id));
    try {
      await api.patch(
        `/api/tob/admin/notification-requirements/${requirement.id}`,
        { enabled }
      );
      mutateAll();
    } catch (error) {
      showError(error, t.notifChannels.actionFailed);
    } finally {
      setBusyPolicyIds((current) => withoutValue(current, requirement.id));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const resource =
        deleting.kind === "rule"
          ? "notification-rules"
          : "notification-requirements";
      await api.delete(`/api/tob/admin/${resource}/${deleting.id}`);
      toast.success(
        deleting.kind === "rule"
          ? t.notifChannels.ruleDeleted
          : t.notifChannels.requirementDeleted
      );
      mutateAll();
    } catch (error) {
      showError(error, t.notifChannels.actionFailed);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.notifChannels.title}</h1>
          <p className="text-sm text-muted-foreground">{t.notifChannels.subtitle}</p>
        </div>
        <ProductSelect
          value={productId}
          onChange={setProductId}
          placeholder={t.notifChannels.selectProduct}
          emptyLabel={t.notifChannels.noProducts}
          autoSelectFirst
        />
      </div>

      {noProducts ? (
        <EmptyState
          icon={<Package className="size-8 text-muted-foreground/40" />}
          title={t.notifChannels.noProducts}
          hint={t.notifChannels.noProductsHint}
        />
      ) : (
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="rules">{t.notifChannels.rules}</TabsTrigger>
              <TabsTrigger value="requirements">
                {t.notifChannels.requirements}
              </TabsTrigger>
              <TabsTrigger value="compliance">
                {t.notifChannels.compliance}
              </TabsTrigger>
            </TabsList>
            {tab === "rules" ? (
              <Button
                size="sm"
                disabled={!productId || !metadataReady}
                onClick={() => {
                  setEditingRule(null);
                  setRuleDialogOpen(true);
                }}
              >
                {!metadataReady && complianceState.isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t.notifChannels.addRule}
              </Button>
            ) : tab === "requirements" ? (
              <Button
                size="sm"
                disabled={!productId || !metadataReady}
                onClick={() => {
                  setEditingRequirement(null);
                  setRequirementDialogOpen(true);
                }}
              >
                {!metadataReady && complianceState.isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {t.notifChannels.addRequirement}
              </Button>
            ) : null}
          </div>

          {tab !== "compliance" && productId && complianceState.error ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <CircleAlert className="size-4 shrink-0" />
                <span>{t.notifChannels.metadataLoadFailed}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void complianceState.mutate()}
              >
                <RefreshCw className="size-4" />
                {t.notifChannels.retry}
              </Button>
            </div>
          ) : null}

          <TabsContent value="rules" className="mt-3">
            <StateBoundary
              ready={Boolean(productId)}
              loading={rulesState.isLoading}
              error={rulesState.error}
              onRetry={() => void rulesState.mutate()}
            >
              {(rulesState.data?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={<BellOff className="size-8 text-muted-foreground/40" />}
                  title={t.notifChannels.noRules}
                  hint={t.notifChannels.noRulesHint}
                />
              ) : (
                <div className="space-y-2">
                  {rulesState.data!.map((rule) => {
                    const target =
                      rule.recipientType === "team"
                        ? teamName(rule.recipientTeamId)
                        : rule.recipientType === "user"
                          ? agentName(rule.recipientUserId)
                          : t.notifChannels.recipients[rule.recipientType];
                    return (
                      <PolicyRow
                        key={rule.id}
                        name={rule.name}
                        target={target}
                        events={rule.triggerEvents.map(
                          (event) => t.notifChannels.events[event]
                        )}
                        channels={rule.channelTypes.map(
                          (channel) => t.notifChannels.types[channel]
                        )}
                        enabled={rule.enabled ?? false}
                        disabled={busyPolicyIds.has(rule.id)}
                        onToggle={(checked) => void toggleRule(rule, checked)}
                        onEdit={() => {
                          setEditingRule(rule);
                          setRuleDialogOpen(true);
                        }}
                        onDelete={() =>
                          setDeleting({ kind: "rule", id: rule.id, name: rule.name })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </StateBoundary>
          </TabsContent>

          <TabsContent value="requirements" className="mt-3">
            <StateBoundary
              ready={Boolean(productId)}
              loading={requirementsState.isLoading}
              error={requirementsState.error}
              onRetry={() => void requirementsState.mutate()}
            >
              {(requirementsState.data?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={<CircleAlert className="size-8 text-muted-foreground/40" />}
                  title={t.notifChannels.noRequirements}
                  hint={t.notifChannels.noRequirementsHint}
                />
              ) : (
                <div className="space-y-2">
                  {requirementsState.data!.map((requirement) => {
                    const target =
                      requirement.scopeType === "team"
                        ? teamName(requirement.scopeTeamId)
                        : requirement.scopeType === "user"
                          ? agentName(requirement.scopeUserId)
                          : t.notifChannels.scopes.product;
                    return (
                      <PolicyRow
                        key={requirement.id}
                        name={requirement.name}
                        target={target}
                        events={requirement.triggerEvents.map(
                          (event) => t.notifChannels.events[event]
                        )}
                        channels={requirement.channelTypes.map(
                          (channel) => t.notifChannels.types[channel]
                        )}
                        enabled={requirement.enabled ?? false}
                        disabled={busyPolicyIds.has(requirement.id)}
                        onToggle={(checked) =>
                          void toggleRequirement(requirement, checked)
                        }
                        onEdit={() => {
                          setEditingRequirement(requirement);
                          setRequirementDialogOpen(true);
                        }}
                        onDelete={() =>
                          setDeleting({
                            kind: "requirement",
                            id: requirement.id,
                            name: requirement.name,
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </StateBoundary>
          </TabsContent>

          <TabsContent value="compliance" className="mt-3">
            <StateBoundary
              ready={Boolean(productId)}
              loading={complianceState.isLoading}
              error={complianceState.error}
              onRetry={() => void complianceState.mutate()}
            >
              {(complianceState.data?.requirements.length ?? 0) === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="size-8 text-emerald-500/60" />}
                  title={t.notifChannels.noComplianceRules}
                  hint={t.notifChannels.noComplianceRulesHint}
                />
              ) : (
                <ComplianceResults
                  requirements={complianceState.data!.requirements}
                />
              )}
            </StateBoundary>
          </TabsContent>
        </Tabs>
      )}

      <RuleDialog
        productId={productId}
        rule={editingRule}
        teams={teams}
        agents={agents}
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        onSaved={mutateAll}
      />
      <RequirementDialog
        productId={productId}
        requirement={editingRequirement}
        teams={teams}
        agents={agents}
        open={requirementDialogOpen}
        onOpenChange={setRequirementDialogOpen}
        onSaved={mutateAll}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.notifChannels.deletePolicyTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.notifChannels.deletePolicyMessage.replace(
                "{{name}}",
                deleting?.name ?? ""
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function PolicyRow({
  name,
  target,
  events,
  channels,
  enabled,
  disabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  name: string;
  target: string;
  events: string[];
  channels: string[];
  enabled: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <Badge variant="secondary">{target}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <BadgeSummary items={events} variant="event" />
            <BadgeSummary items={channels} variant="channel" />
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-label={t.notifChannels.enabled}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onEdit}
              aria-label={t.common.edit}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.common.edit}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t.notifChannels.moreActions}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t.notifChannels.moreActions}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" />
              {t.common.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

function BadgeSummary({
  items,
  variant,
}: {
  items: string[];
  variant: "event" | "channel";
}) {
  const { t } = useI18n();
  const visible = items.slice(0, 2);
  const hidden = items.slice(2);
  return (
    <>
      {visible.map((item) =>
        variant === "event" ? (
          <Badge key={item} variant="outline" className="max-w-36 truncate text-[10px]">
            {item}
          </Badge>
        ) : (
          <Badge
            key={item}
            className="max-w-36 truncate bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-400"
          >
            {item}
          </Badge>
        )
      )}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="cursor-default text-[10px]"
              aria-label={hidden.join(", ")}
            >
              +{hidden.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent sideOffset={4} className="max-w-72">
            {t.notifChannels.moreCount.replace("{{count}}", String(hidden.length))}: {hidden.join(", ")}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}

type ComplianceRequirement = NotificationComplianceView["requirements"][number];

function ComplianceResults({
  requirements,
}: {
  requirements: ComplianceRequirement[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      requirements
        .map((requirement) => {
          const requirementMatches = requirement.name
            .toLocaleLowerCase()
            .includes(normalizedQuery);
          const matchingMissing =
            normalizedQuery && !requirementMatches
              ? requirement.missing.filter((entry) =>
                  entry.displayName.toLocaleLowerCase().includes(normalizedQuery)
                )
              : requirement.missing;
          return { requirement, requirementMatches, matchingMissing };
        })
        .filter(
          ({ requirementMatches, matchingMissing }) =>
            !normalizedQuery || requirementMatches || matchingMissing.length > 0
        ),
    [normalizedQuery, requirements]
  );

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.notifChannels.complianceSearch}
          aria-label={t.notifChannels.complianceSearch}
          className="pl-9"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed px-4 text-sm text-muted-foreground">
          {t.notifChannels.noComplianceResults}
        </div>
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {filtered.map(({ requirement, matchingMissing }) => {
            const isOpen = expanded.has(requirement.id);
            const visibleCount = visibleCounts[requirement.id] ?? 8;
            const visibleMissing = matchingMissing.slice(0, visibleCount);
            const remaining = matchingMissing.length - visibleMissing.length;
            const detailsId = `compliance-${requirement.id}`;
            return (
              <div key={requirement.id}>
                <div className="flex items-start gap-3 px-4 py-3">
                  {requirement.missing.length === 0 ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{requirement.name}</p>
                      <Badge variant="secondary">
                        {requirement.missing.length === 0
                          ? t.notifChannels.compliant
                          : t.notifChannels.missingCount.replace(
                              "{{count}}",
                              String(requirement.missing.length)
                            )}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.notifChannels.targetCount.replace(
                        "{{count}}",
                        String(requirement.targetCount)
                      )}
                    </p>
                  </div>
                  {requirement.missing.length > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-expanded={isOpen}
                          aria-controls={detailsId}
                          aria-label={
                            isOpen
                              ? t.notifChannels.hideMissing
                              : t.notifChannels.showMissing
                          }
                          onClick={() => toggleExpanded(requirement.id)}
                        >
                          <ChevronDown
                            className={`size-4 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isOpen
                          ? t.notifChannels.hideMissing
                          : t.notifChannels.showMissing}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                {isOpen ? (
                  <div
                    id={detailsId}
                    className="space-y-2 border-t bg-muted/20 px-4 py-3 sm:pl-11"
                  >
                    {visibleMissing.map((entry) => (
                      <div
                        key={entry.userId}
                        className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {entry.displayName}
                        </span>
                        <span>{t.notifChannels.missing}</span>
                        <BadgeSummary
                          items={entry.channelTypes.map(
                            (channel) => t.notifChannels.types[channel]
                          )}
                          variant="channel"
                        />
                      </div>
                    ))}
                    {remaining > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVisibleCounts((current) => ({
                            ...current,
                            [requirement.id]: visibleCount + Math.min(20, remaining),
                          }))
                        }
                      >
                        {t.notifChannels.showMoreMissing.replace(
                          "{{count}}",
                          String(Math.min(20, remaining))
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StateBoundary({
  ready,
  loading,
  error,
  onRetry,
  children,
}: {
  ready: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  if (!ready || loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<RefreshCw className="size-8 text-muted-foreground/40" />}
        title={t.notifChannels.loadFailed}
        hint={t.notifChannels.retry}
        action={<Button variant="outline" size="sm" onClick={onRetry}>{t.notifChannels.retry}</Button>}
      />
    );
  }
  return children;
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 py-10 text-center">
        {icon}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {action}
      </CardContent>
    </Card>
  );
}

function showError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiClientError ? error.message : fallback);
}

function withoutValue(current: Set<string>, value: string) {
  const next = new Set(current);
  next.delete(value);
  return next;
}
