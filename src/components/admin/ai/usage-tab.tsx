"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import type { AIProvider, AITaskType } from "@/drizzle/schema";
import { Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aiScopeQuery } from "./scope";
import { AiUsageSkeleton } from "./ai-loading-skeletons";

interface DailyRow {
  bucketKey: string;
  day: string;
  credentialId: string;
  taskType: AITaskType;
  credentialName: string | null;
  provider: AIProvider | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

interface UsageResponse {
  items: DailyRow[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
  };
}

interface SettingsResponse {
  inherit: boolean;
  retentionDays: number | null;
  configured: boolean;
}

const ALL = "__all__";
const modelKey = (row: DailyRow) => JSON.stringify([row.provider, row.model]);

const PRESETS = [7, 30, 90, 180, 365] as const;

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function UsageTab({
  scope = "system",
  tenantId,
  productId,
}: {
  scope?: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
}) {
  const { t } = useI18n();
  const u = t.aiConfig.usage;
  const range = useMemo(() => defaultRange(), []);
  const scopeQuery = aiScopeQuery({ scope, tenantId, productId });
  const usageKey = `/api/tob/admin/ai/usage?dimension=${scope}&from=${range.from}&to=${range.to}${
    tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ""
  }${productId ? `&productId=${encodeURIComponent(productId)}` : ""}`;
  const { data, error, isLoading } = useSWR<UsageResponse>(usageKey, swrFetcher);
  const settings = useSWR<SettingsResponse>(
    `/api/tob/admin/ai/usage/settings${scopeQuery}`,
    swrFetcher
  );
  const [inherit, setInherit] = useState<boolean | null>(null);
  const [retention, setRetention] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inheritValue = inherit ?? settings.data?.inherit ?? scope !== "system";
  const retentionValue = retention ?? (settings.data?.retentionDays == null
    ? "forever" : String(settings.data.retentionDays));
  const [credentialFilter, setCredentialFilter] = useState(ALL);
  const [modelFilter, setModelFilter] = useState(ALL);
  const [view, setView] = useState("summary");
  const credentialLabel = (row: DailyRow) => row.credentialName ?? `${u.deletedCredential} (${row.credentialId})`;
  const modelLabel = (row: DailyRow) => row.model == null
    ? u.legacyModel
    : `${row.provider ? t.aiConfig.providers[row.provider] : ""} / ${row.model}`;
  const credentialOptions = Array.from(new Map(
    data?.items.map((row) => [row.credentialId, row]) ?? []
  ).values());
  const credentialRows = (data?.items ?? []).filter((row) => credentialFilter === ALL || row.credentialId === credentialFilter);
  const modelOptions = Array.from(new Map(credentialRows.map((row) => [modelKey(row), row])).values());
  const filteredRows = credentialRows.filter((row) => modelFilter === ALL || modelKey(row) === modelFilter);
  const totals = { requestCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const groups = new Map<string, DailyRow>();
  for (const row of filteredRows) {
    totals.requestCount += row.requestCount;
    totals.promptTokens += row.promptTokens;
    totals.completionTokens += row.completionTokens;
    totals.totalTokens += row.totalTokens;
    const key = JSON.stringify([row.credentialId, row.provider, row.model]);
    const group = groups.get(key);
    if (group) {
      group.requestCount += row.requestCount;
      group.promptTokens += row.promptTokens;
      group.completionTokens += row.completionTokens;
      group.totalTokens += row.totalTokens;
    } else {
      groups.set(key, { ...row, bucketKey: key });
    }
  }
  const rows = view === "daily" ? filteredRows : Array.from(groups.values())
    .sort((a, b) => b.totalTokens - a.totalTokens || a.bucketKey.localeCompare(b.bucketKey));

  const saveSettings = async () => {
    setPending(true);
    try {
      await api.patch(`/api/tob/admin/ai/usage/settings${scopeQuery}`, {
        inherit: scope !== "system" && inheritValue,
        retentionDays:
          inheritValue && scope !== "system"
            ? undefined
            : retentionValue === "forever"
              ? null
              : Number(retentionValue),
      });
      toast.success(u.saved);
      await settings.mutate();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : u.saveFailed);
    } finally {
      setPending(false);
    }
  };

  if (isLoading || settings.isLoading) {
    return <AiUsageSkeleton scope={scope} />;
  }

  return (
    <div className="space-y-4">
      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">{u.retentionTitle}</CardTitle>
          <CardDescription className="text-xs">{u.retentionHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 px-5 pb-4">
          {scope !== "system" && (
            <div className="flex items-center gap-2">
              <Switch
                id="usage-inherit"
                checked={inheritValue}
                onCheckedChange={setInherit}
              />
              <Label htmlFor="usage-inherit" className="text-xs">{u.inheritRetention}</Label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{u.retention}</Label>
            <Select
              value={retentionValue}
              onValueChange={setRetention}
              disabled={inheritValue && scope !== "system"}
            >
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="forever">{u.forever}</SelectItem>
                {PRESETS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {u.days.replace("{{days}}", String(days))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-8" onClick={() => void saveSettings()} disabled={pending}>
            <Save className="size-3.5" />
            {t.common.save}
          </Button>
        </CardContent>
      </Card>

      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-sm">{u.title}</CardTitle>
          <CardDescription className="text-xs">
            {u.range.replace("{{from}}", range.from).replace("{{to}}", range.to)}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{u.loadFailed}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Select value={credentialFilter} onValueChange={(value) => { setCredentialFilter(value); setModelFilter(ALL); }}>
                  <SelectTrigger size="sm" className="w-full sm:w-48" aria-label={t.aiConfig.routing.credential}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{u.allCredentials}</SelectItem>
                    {credentialOptions.map((row) => <SelectItem key={row.credentialId} value={row.credentialId}>{credentialLabel(row)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={modelFilter} onValueChange={setModelFilter}>
                  <SelectTrigger size="sm" className="w-full sm:w-64" aria-label={t.aiConfig.model}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{u.allModels}</SelectItem>
                    {modelOptions.map((row) => <SelectItem key={modelKey(row)} value={modelKey(row)}>{modelLabel(row)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={view} onValueChange={setView}>
                  <SelectTrigger size="sm" className="w-full sm:ml-auto sm:w-48" aria-label={u.grouping}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">{u.byCredentialModel}</SelectItem>
                    <SelectItem value="daily">{u.dailyDetails}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={u.requests} value={totals.requestCount} />
                <Stat label={u.promptTokens} value={totals.promptTokens} />
                <Stat label={u.completionTokens} value={totals.completionTokens} />
                <Stat label={u.totalTokens} value={totals.totalTokens} />
              </div>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{u.empty}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {view === "daily" && <TableHead>{u.day}</TableHead>}
                      <TableHead>{t.aiConfig.routing.credential}</TableHead>
                      <TableHead>{t.aiConfig.model}</TableHead>
                      {view === "daily" && <TableHead>{u.task}</TableHead>}
                      <TableHead className="text-right">{u.requests}</TableHead>
                      <TableHead className="text-right">{u.promptTokens}</TableHead>
                      <TableHead className="text-right">{u.completionTokens}</TableHead>
                      <TableHead className="text-right">{u.totalTokens}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.bucketKey}>
                        {view === "daily" && <TableCell>{row.day}</TableCell>}
                        <TableCell title={row.credentialId}>
                          <span className="block max-w-48 truncate" title={credentialLabel(row)}>{credentialLabel(row)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-72 truncate" title={row.model ?? u.legacyModel}>{row.model ?? u.legacyModel}</span>
                          {row.provider && <span className="text-[11px] text-muted-foreground">{t.aiConfig.providers[row.provider]}</span>}
                        </TableCell>
                        {view === "daily" && <TableCell>{t.aiConfig.tasks[row.taskType]}</TableCell>}
                        <TableCell className="text-right tabular-nums">{row.requestCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.promptTokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.completionTokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.totalTokens.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
