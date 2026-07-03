"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, ApiClientError } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TASK_TYPES = ["agent", "prescreening", "prereply", "embedding"] as const;
const PROVIDERS = ["openai", "anthropic", "google", "xai", "deepseek"] as const;

type TaskType = (typeof TASK_TYPES)[number];
type Provider = (typeof PROVIDERS)[number];

interface AiConfigView {
  id: string;
  taskType: TaskType;
  provider: Provider;
  model: string;
  apiKey: string; // masked
  hasKey: boolean;
  baseUrl: string | null;
  enabled: boolean | null;
}

export default function AdminAiPage() {
  const { t } = useI18n();
  const { me, isLoading: meLoading } = useMe();
  const isSuperAdmin = me?.role === "super_admin";

  const { data, error, isLoading, mutate } = useSWR<AiConfigView[]>(
    isSuperAdmin ? "/api/tob/admin/ai/config" : null,
    swrFetcher
  );

  if (meLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1.5 py-16 text-center">
          <ShieldAlert className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t.aiConfig.noAccess}</p>
          <p className="text-xs text-muted-foreground">{t.aiConfig.noAccessHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {t.aiConfig.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.aiConfig.subtitle}</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t.aiConfig.loadFailed}</p>
            <Button variant="outline" size="sm" onClick={() => void mutate()}>
              <RefreshCw className="size-4" />
              {t.aiConfig.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {TASK_TYPES.map((taskType) => (
            <TaskConfigCard
              key={taskType}
              taskType={taskType}
              config={data?.find((c) => c.taskType === taskType) ?? null}
              onSaved={() => void mutate()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskConfigCard({
  taskType,
  config,
  onSaved,
}: {
  taskType: TaskType;
  config: AiConfigView | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setProvider(config?.provider ?? "openai");
    setModel(config?.model ?? "");
    setApiKey("");
    setBaseUrl(config?.baseUrl ?? "");
    setEnabled(config?.enabled ?? true);
  }, [config]);

  const save = async () => {
    if (!model.trim()) {
      toast.error(t.aiConfig.modelRequired);
      return;
    }
    if (!config && !apiKey.trim()) {
      toast.error(t.aiConfig.apiKeyRequired);
      return;
    }

    setPending(true);
    try {
      if (config) {
        // PATCH keeps the stored key when apiKey is left blank
        await api.patch(`/api/tob/admin/ai/config/${taskType}`, {
          provider,
          model: model.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          baseUrl: baseUrl.trim() || null,
          enabled,
        });
      } else {
        await api.post("/api/tob/admin/ai/config", {
          taskType,
          provider,
          model: model.trim(),
          apiKey: apiKey.trim(),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          enabled,
        });
      }
      toast.success(t.aiConfig.saved);
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t.aiConfig.saveFailed
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-muted">
              <Sparkles className="size-4 text-muted-foreground" />
            </span>
            <div>
              <CardTitle className="text-sm">
                {t.aiConfig.tasks[taskType]}
              </CardTitle>
              <CardDescription className="text-xs">
                {t.aiConfig.tasks[`${taskType}Hint` as const]}
              </CardDescription>
            </div>
          </div>
          <span
            className={
              config?.hasKey
                ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400"
                : "rounded bg-zinc-500/10 px-1.5 py-0.5 text-[11px] text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:text-zinc-400"
            }
          >
            {config?.hasKey ? t.aiConfig.configured : t.aiConfig.notConfigured}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t.aiConfig.provider}</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.aiConfig.providers[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`model-${taskType}`}>{t.aiConfig.model}</Label>
            <Input
              id={`model-${taskType}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t.aiConfig.modelPlaceholder}
              className="h-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`key-${taskType}`}>{t.aiConfig.apiKey}</Label>
          <Input
            id={`key-${taskType}`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              config?.hasKey
                ? t.aiConfig.apiKeyConfigured
                : t.aiConfig.apiKeyPlaceholder
            }
            className="h-8"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`url-${taskType}`}>{t.aiConfig.baseUrl}</Label>
          <Input
            id={`url-${taskType}`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t.aiConfig.baseUrlPlaceholder}
            className="h-8"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Switch
              id={`enabled-${taskType}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor={`enabled-${taskType}`} className="text-xs">
              {t.aiConfig.enabled}
            </Label>
          </div>
          <Button size="sm" className="h-8" onClick={save} disabled={pending}>
            {t.aiConfig.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
