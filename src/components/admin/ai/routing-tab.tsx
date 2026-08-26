"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import {
  AI_TASK_TYPES,
  modelKindForTask,
  type AIModelKind,
  type AIProviderValue,
  type AITaskTypeValue,
} from "@/lib/ai-config";
import { cn } from "@/lib/utils";
import type { AiCredentialView } from "./credentials-tab";
import {
  defaultModelForTask,
  modelsForTask,
  providerSupportsTask,
} from "./provider-presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { aiScopeQuery } from "./scope";
import { AiRoutingSkeleton } from "./ai-loading-skeletons";

interface TaskAssignmentView {
  id: string;
  taskType: AITaskTypeValue;
  credentialId: string;
  model: string;
  priority: number;
  enabled: boolean;
  credentialName: string;
  provider: AIProviderValue;
  credentialEnabled: boolean;
  blockedUntil: string | null;
  modelKind: AIModelKind | null;
  modelDimensions: number | null;
}

interface TaskRoutingView {
  id: string | null;
  taskType: AITaskTypeValue;
  enabled: boolean;
  inherit: boolean;
  assignments: TaskAssignmentView[];
  inheritedFrom: "system" | "tenant" | "product" | null;
  inheritedEnabled: boolean;
  inheritedAssignments: TaskAssignmentView[];
}

interface AssignmentDraft {
  id: string;
  credentialId: string;
  model: string;
  enabled: boolean;
  modelKind?: AIModelKind;
  modelDimensions?: number;
}

export function RoutingTab({
  scope = "system",
  tenantId,
  productId,
}: {
  scope?: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
}) {
  const { t } = useI18n();
  const scopeQuery = aiScopeQuery({ scope, tenantId, productId });
  const routing = useSWR<TaskRoutingView[]>(
    `/api/tob/admin/ai/config${scopeQuery}`,
    swrFetcher
  );
  const credentials = useSWR<AiCredentialView[]>(
    `/api/tob/admin/ai/credentials${aiScopeQuery({ scope, tenantId, productId, includeInherited: true })}`,
    swrFetcher
  );

  if (routing.isLoading || credentials.isLoading) {
    return <AiRoutingSkeleton />;
  }

  if (routing.error || credentials.error) {
    return (
      <Card>
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t.aiConfig.loadFailed}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void routing.mutate();
              void credentials.mutate();
            }}
          >
            <RefreshCw className="size-4" />
            {t.aiConfig.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      {AI_TASK_TYPES.map((taskType) => (
        <TaskRoutingCard
          key={taskType}
          taskType={taskType}
          scope={scope}
          tenantId={tenantId}
          productId={productId}
          config={routing.data?.find((item) => item.taskType === taskType) ?? null}
          credentials={credentials.data ?? []}
          onSaved={() => void routing.mutate()}
        />
      ))}
    </div>
  );
}

function TaskRoutingCard({
  taskType,
  scope,
  tenantId,
  productId,
  config,
  credentials,
  onSaved,
}: {
  taskType: AITaskTypeValue;
  scope: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
  config: TaskRoutingView | null;
  credentials: AiCredentialView[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const r = t.aiConfig.routing;
  const [enabled, setEnabled] = useState(true);
  const [inherit, setInherit] = useState(scope !== "system");
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [catalogs, setCatalogs] = useState<Record<
    string,
    Array<{ id: string; kind: AIModelKind; dimensions?: number }>
  >>({});
  const [loadingCatalog, setLoadingCatalog] = useState<string | null>(null);

  const compatibleCredentials = useMemo(
    () =>
      credentials.filter((credential) =>
        providerSupportsTask(credential.provider, taskType)
      ),
    [credentials, taskType]
  );

  useEffect(() => {
    setEnabled(config?.enabled ?? true);
    setInherit(config?.inherit ?? scope !== "system");
    setAssignments(
      config?.assignments.map((assignment) => ({
        id: assignment.id,
        credentialId: assignment.credentialId,
        model: assignment.model,
        enabled: assignment.enabled,
        modelKind: assignment.modelKind ?? undefined,
        modelDimensions: assignment.modelDimensions ?? undefined,
      })) ?? []
    );
  }, [config]);

  const addAssignment = () => {
    const used = new Set(assignments.map((assignment) => assignment.credentialId));
    const credential = compatibleCredentials.find((item) => !used.has(item.id));
    if (!credential) {
      toast.error(
        compatibleCredentials.length === 0 ? r.noCompatible : r.allAssigned
      );
      return;
    }
    setAssignments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        credentialId: credential.id,
        model: defaultModelForTask(credential.provider, taskType),
        enabled: true,
        modelKind: modelKindForTask(taskType),
        modelDimensions: taskType === "embedding" ? 1024 : undefined,
      },
    ]);
  };

  const updateAssignment = (
    index: number,
    patch: Partial<AssignmentDraft>
  ) => {
    setAssignments((current) =>
      current.map((assignment, itemIndex) =>
        itemIndex === index ? { ...assignment, ...patch } : assignment
      )
    );
  };

  const move = (index: number, offset: -1 | 1) => {
    setAssignments((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const canEnable = inherit || assignments.some((assignment) => assignment.enabled);
  const inheritedFrom = config?.inheritedFrom ?? (scope === "product" ? "tenant" : "system");
  const inheritedAssignments = config?.inheritedAssignments ?? [];

  const startOverride = () => {
    setInherit(false);
    if (assignments.length === 0 && inheritedAssignments.length > 0) {
      setAssignments(
        inheritedAssignments.map((assignment) => ({
          id: crypto.randomUUID(),
          credentialId: assignment.credentialId,
          model: assignment.model,
          enabled: assignment.enabled,
          modelKind: assignment.modelKind ?? undefined,
          modelDimensions: assignment.modelDimensions ?? undefined,
        }))
      );
    }
    if (config) setEnabled(config.inheritedEnabled);
  };

  const save = async () => {
    if (enabled && !inherit && !canEnable) {
      toast.error(r.routeRequired);
      return;
    }
    if (assignments.some((assignment) => !assignment.model.trim())) {
      toast.error(t.aiConfig.modelRequired);
      return;
    }

    setPending(true);
    try {
      await api.post(`/api/tob/admin/ai/config${aiScopeQuery({ scope, tenantId, productId })}`, {
        taskType,
        enabled,
        inherit,
        assignments: inherit
          ? []
          : assignments.map((assignment) => ({
              credentialId: assignment.credentialId,
              model: assignment.model.trim(),
              ...(assignment.modelKind ? { modelKind: assignment.modelKind } : {}),
              ...(assignment.modelDimensions ? { modelDimensions: assignment.modelDimensions } : {}),
              enabled: assignment.enabled,
            })),
      });
      toast.success(r.saved);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : r.saveFailed);
    } finally {
      setPending(false);
    }
  };

  const loadCatalog = async (credentialId: string) => {
    setLoadingCatalog(credentialId);
    try {
      const scopeQuery = aiScopeQuery({ scope, tenantId, productId })
        .replace("?", "&");
      const result = await api.get<{
        models: Array<{ id: string; kind: AIModelKind; dimensions?: number }>;
      }>(
        `/api/tob/admin/ai/models?credentialId=${encodeURIComponent(credentialId)}${scopeQuery}`,
      );
      setCatalogs((current) => ({ ...current, [credentialId]: result.models }));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : r.loadModelsFailed);
    } finally {
      setLoadingCatalog(null);
    }
  };

  return (
    <Card className="flex h-full min-h-[360px] flex-col gap-0 rounded-lg py-0">
      <CardHeader className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <GitBranch className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm">{t.aiConfig.tasks[taskType]}</CardTitle>
              <CardDescription className="text-xs">
                {t.aiConfig.tasks[`${taskType}Hint` as const]}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!inherit && (
              <>
                <Switch
                  id={`task-enabled-${taskType}`}
                  checked={enabled && canEnable}
                  disabled={pending || !canEnable}
                  onCheckedChange={(next) => {
                    if (next && !canEnable) {
                      toast.error(r.routeRequired);
                      return;
                    }
                    setEnabled(next);
                  }}
                />
                <Label htmlFor={`task-enabled-${taskType}`} className="sr-only">
                  {t.aiConfig.enabled}
                </Label>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-4 pb-4">
        {inherit ? (
          <div className="flex min-h-40 flex-1 flex-col gap-3">
            <div className="rounded-md border border-dashed px-3 py-3">
              <p className="text-sm font-medium">
                {r.usingParent.replace(
                  "{{scope}}",
                  t.aiConfig.scopes[inheritedFrom === "tenant" ? "tenant" : "system"]
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{r.inheritHint}</p>
              {inheritedAssignments.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">{r.parentEmpty}</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {inheritedAssignments.map((assignment, index) => (
                    <li key={assignment.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {index + 1}. {assignment.credentialName}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{assignment.model}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 self-start"
              onClick={startOverride}
              disabled={pending}
            >
              {r.override}
            </Button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 text-center">
            <GitBranch className="size-6 text-muted-foreground/45" />
            <p className="text-sm font-medium">{r.empty}</p>
            <p className="text-xs text-muted-foreground">
              {compatibleCredentials.length === 0 ? r.noCredentialsHint : r.emptyHint}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment, index) => {
              const credential = credentials.find(
                (item) => item.id === assignment.credentialId
              );
              const models = credential
                ? modelsForTask(credential.provider, taskType)
                : [];
              const fetchedModels = catalogs[assignment.credentialId];
              const availableModels = fetchedModels
                ? fetchedModels
                    .filter((model) =>
                      model.kind === modelKindForTask(taskType) &&
                      (model.kind !== "embedding" || model.dimensions === 1024)
                    )
                    .map((model) => model.id)
                : models;
              const usedByOthers = new Set(
                assignments
                  .filter((_, itemIndex) => itemIndex !== index)
                  .map((item) => item.credentialId)
              );
              const blocked = Boolean(
                credential?.blockedUntil &&
                  Date.parse(credential.blockedUntil) > Date.now()
              );

              return (
                <div
                  key={assignment.id}
                  className={cn(
                    "rounded-md border p-3",
                    !assignment.enabled && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span className="flex size-8 items-center justify-center">
                        <Switch
                          size="sm"
                          checked={assignment.enabled}
                          onCheckedChange={(value) => updateAssignment(index, { enabled: value })}
                          aria-label={t.aiConfig.enabled}
                        />
                      </span>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={r.moveUp}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === assignments.length - 1} aria-label={r.moveDown}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <Label className="text-[11px]">{r.credential}</Label>
                      <Select
                        value={assignment.credentialId}
                        onValueChange={(credentialId) => {
                          const nextCredential = credentials.find(
                            (item) => item.id === credentialId
                          );
                          updateAssignment(index, {
                            credentialId,
                            model: nextCredential
                              ? defaultModelForTask(nextCredential.provider, taskType)
                              : "",
                            modelKind: nextCredential ? modelKindForTask(taskType) : undefined,
                            modelDimensions: taskType === "embedding" ? 1024 : undefined,
                          });
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-full min-w-0"
                          aria-label={r.credential}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {compatibleCredentials.map((item) => (
                            <SelectItem
                              key={item.id}
                              value={item.id}
                              disabled={usedByOthers.has(item.id)}
                            >
                              {item.inherited
                                ? `${item.name} (${t.aiConfig.scopes[item.scope ?? "system"]})`
                                : item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(blocked || credential?.enabled === false) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {blocked ? r.coolingDown : r.credentialDisabled}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`model-${taskType}-${assignment.id}`} className="text-[11px]">
                        {t.aiConfig.model}
                      </Label>
                      <Input
                        id={`model-${taskType}-${assignment.id}`}
                        className="h-8 w-full"
                        value={assignment.model}
                        onChange={(event) => {
                          const value = event.target.value;
                          const catalogModel = (catalogs[assignment.credentialId] ?? [])
                            .find((item) => item.id === value);
                          updateAssignment(index, {
                            model: value,
                            modelKind: catalogModel?.kind,
                            modelDimensions: catalogModel?.dimensions,
                          });
                        }}
                        list={`models-${taskType}-${assignment.id}`}
                      />
                      <datalist id={`models-${taskType}-${assignment.id}`}>
                        {availableModels
                          .filter((model, index, all) => all.indexOf(model) === index)
                          .map((model) => <option key={model} value={model} />)}
                      </datalist>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-0 text-[11px]"
                        onClick={() => void loadCatalog(assignment.credentialId)}
                        disabled={loadingCatalog === assignment.credentialId}
                      >
                        {loadingCatalog === assignment.credentialId && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        {t.aiConfig.routing.loadModels}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t pt-3">
          {inherit ? (
            <span />
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={addAssignment}
                disabled={compatibleCredentials.length === 0}
              >
                <Plus className="size-4" />
                {r.addFallback}
              </Button>
              {scope !== "system" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => setInherit(true)}
                  disabled={pending}
                >
                  {r.useParent}
                </Button>
              )}
            </div>
          )}
          <Button size="sm" className="h-8" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.aiConfig.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
