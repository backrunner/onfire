"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
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
  day: string;
  credentialId: string;
  taskType: string;
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
  const [retention, setRetention] = useState<string>("forever");
  const [pending, setPending] = useState(false);

  const inheritValue = inherit ?? settings.data?.inherit ?? scope !== "system";
  const retentionValue =
    retention === "forever" && settings.data && !settings.data.inherit
      ? settings.data.retentionDays == null
        ? "forever"
        : String(settings.data.retentionDays)
      : retention;

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
      <Card className="gap-0 py-0">
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

      <Card className="gap-0 py-0">
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
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat label={u.requests} value={data?.totals.requestCount ?? 0} />
                <Stat label={u.promptTokens} value={data?.totals.promptTokens ?? 0} />
                <Stat label={u.totalTokens} value={data?.totals.totalTokens ?? 0} />
              </div>
              {(data?.items.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{u.empty}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{u.day}</TableHead>
                      <TableHead>{u.task}</TableHead>
                      <TableHead className="text-right">{u.requests}</TableHead>
                      <TableHead className="text-right">{u.totalTokens}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((row) => (
                      <TableRow key={`${row.day}-${row.credentialId}-${row.taskType}`}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell>{t.aiConfig.tasks[row.taskType as "agent"] ?? row.taskType}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.requestCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.totalTokens}</TableCell>
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
