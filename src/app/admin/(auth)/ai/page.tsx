"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, ApiClientError } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import {
  AI_TASK_TYPES,
  EMBEDDING_AI_PROVIDERS,
  LANGUAGE_AI_PROVIDERS,
  type AIProviderValue,
  type AITaskTypeValue,
  type OpenAIApiModeValue,
} from "@/lib/ai-config";
import { KnowledgeTab } from "@/components/admin/ai/knowledge-tab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TASK_TYPES = AI_TASK_TYPES;
type TaskType = AITaskTypeValue;
type Provider = AIProviderValue;

type ProviderPreset = { models: string[]; baseUrl: string };

const LANGUAGE_PROVIDER_PRESETS: Record<
  (typeof LANGUAGE_AI_PROVIDERS)[number],
  ProviderPreset
> = {
  openai: {
    models: ["gpt-5.4-mini", "gpt-4.1-mini"],
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    baseUrl: "https://api.anthropic.com/v1",
  },
  google: {
    models: ["gemini-2.5-flash"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  xai: { models: ["grok-4-fast"], baseUrl: "https://api.x.ai/v1" },
  deepseek: { models: ["deepseek-chat"], baseUrl: "https://api.deepseek.com" },
};

const EMBEDDING_PROVIDER_PRESETS: Record<
  (typeof EMBEDDING_AI_PROVIDERS)[number],
  ProviderPreset
> = {
  openai: {
    models: ["text-embedding-3-small", "text-embedding-3-large"],
    baseUrl: "https://api.openai.com/v1",
  },
  qwen: {
    models: ["text-embedding-v4", "text-embedding-v3"],
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  jina: {
    models: ["jina-embeddings-v5", "jina-embeddings-v4", "jina-embeddings-v3"],
    baseUrl: "https://api.jina.ai/v1",
  },
  cohere: {
    models: ["embed-v4.0", "embed-multilingual-v3.0"],
    baseUrl: "https://api.cohere.com/v2",
  },
  google: {
    models: ["gemini-embedding-2", "gemini-embedding-001"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
};

const LANGUAGE_DEFAULT_MODEL: Record<(typeof LANGUAGE_AI_PROVIDERS)[number], string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-4-5",
  google: "gemini-2.5-flash",
  xai: "grok-4-fast",
  deepseek: "deepseek-chat",
};

const EMBEDDING_DEFAULT_MODEL: Record<
  (typeof EMBEDDING_AI_PROVIDERS)[number],
  string
> = {
  openai: "text-embedding-3-small",
  qwen: "text-embedding-v4",
  jina: "jina-embeddings-v5",
  cohere: "embed-v4.0",
  google: "gemini-embedding-2",
};

interface AiConfigView {
  id: string;
  taskType: TaskType;
  provider: Provider;
  apiMode: OpenAIApiModeValue;
  model: string;
  apiKey: string; // masked
  hasKey: boolean;
  baseUrl: string | null;
  enabled: boolean | null;
}

export default function AdminAiPage() {
  const { t } = useI18n();
  const { can, isLoading: meLoading } = useMe();
  const canConfigureModels = can("ai.config");
  const canKnowledge = can("ai.knowledge");

  if (meLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!canConfigureModels && !canKnowledge) {
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {t.aiConfig.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.aiConfig.subtitle}</p>
      </div>

      <Tabs defaultValue={canConfigureModels ? "models" : "knowledge"}>
        <TabsList>
          {canConfigureModels && (
            <TabsTrigger value="models">{t.aiConfig.tabs.models}</TabsTrigger>
          )}
          {canKnowledge && (
            <TabsTrigger value="knowledge">
              {t.aiConfig.tabs.knowledge}
            </TabsTrigger>
          )}
        </TabsList>
        {canConfigureModels && (
          <TabsContent value="models" className="mt-4">
            <ModelsSection />
          </TabsContent>
        )}
        {canKnowledge && (
          <TabsContent value="knowledge" className="mt-4">
            <KnowledgeTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ModelsSection() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<AiConfigView[]>(
    "/api/tob/admin/ai/config",
    swrFetcher
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t.aiConfig.loadFailed}</p>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>
            <RefreshCw className="size-4" />
            {t.aiConfig.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
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
  const [apiMode, setApiMode] = useState<OpenAIApiModeValue>("responses");
  const [enabled, setEnabled] = useState(true);
  const [pending, setPending] = useState(false);
  const providerPreset =
    taskType === "embedding"
      ? EMBEDDING_PROVIDER_PRESETS[
          provider as keyof typeof EMBEDDING_PROVIDER_PRESETS
        ]
      : LANGUAGE_PROVIDER_PRESETS[
          provider as keyof typeof LANGUAGE_PROVIDER_PRESETS
        ];

  useEffect(() => {
    setProvider(config?.provider ?? "openai");
    setModel(config?.model ?? "");
    setApiKey("");
    setBaseUrl(config?.baseUrl ?? "");
    setApiMode(config?.apiMode ?? "responses");
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
          apiMode,
          model: model.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          baseUrl: baseUrl.trim() || null,
          enabled,
        });
      } else {
        await api.post("/api/tob/admin/ai/config", {
          taskType,
          provider,
          apiMode,
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
    <Card className="h-full gap-0 py-0">
      <CardHeader className="px-5 py-4">
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
      <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.aiConfig.provider}</Label>
            <Select
              value={provider}
              onValueChange={(value) => {
                const nextProvider = value as Provider;
                setProvider(nextProvider);
                const presets =
                  taskType === "embedding"
                    ? EMBEDDING_PROVIDER_PRESETS
                    : LANGUAGE_PROVIDER_PRESETS;
                const knownModels = Object.values(presets).flatMap(
                  (preset) => preset.models
                );
                if (!model || knownModels.includes(model)) {
                  setModel(
                    taskType === "embedding"
                      ? EMBEDDING_DEFAULT_MODEL[
                          nextProvider as keyof typeof EMBEDDING_DEFAULT_MODEL
                        ]
                      : LANGUAGE_DEFAULT_MODEL[
                          nextProvider as keyof typeof LANGUAGE_DEFAULT_MODEL
                        ]
                  );
                }
                setBaseUrl("");
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(taskType === "embedding"
                  ? EMBEDDING_AI_PROVIDERS
                  : LANGUAGE_AI_PROVIDERS
                ).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.aiConfig.providers[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`model-${taskType}`}>
              {t.aiConfig.model}
            </Label>
            <Input
              id={`model-${taskType}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list={`model-options-${taskType}`}
              placeholder={
                taskType === "embedding"
                  ? EMBEDDING_DEFAULT_MODEL[
                      provider as keyof typeof EMBEDDING_DEFAULT_MODEL
                    ]
                  : LANGUAGE_DEFAULT_MODEL[
                      provider as keyof typeof LANGUAGE_DEFAULT_MODEL
                    ]
              }
              className="h-8"
            />
            <datalist id={`model-options-${taskType}`}>
              {providerPreset.models.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
            </datalist>
          </div>
        </div>

        {provider === "openai" && taskType !== "embedding" && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t.aiConfig.apiMode}</Label>
            <Select
              value={apiMode}
              onValueChange={(value) =>
                setApiMode(value as OpenAIApiModeValue)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="responses">
                  {t.aiConfig.apiModes.responses}
                </SelectItem>
                <SelectItem value="chat">{t.aiConfig.apiModes.chat}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`key-${taskType}`}>
            {t.aiConfig.apiKey}
          </Label>
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
          <Label className="text-xs" htmlFor={`url-${taskType}`}>
            {t.aiConfig.baseUrl}
          </Label>
          <Input
            id={`url-${taskType}`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={providerPreset.baseUrl}
            className="h-8"
          />
        </div>

        <div className="mt-auto flex items-center justify-between pt-1">
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
