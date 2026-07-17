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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

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
}

interface TaskRoutingView {
  id: string;
  taskType: AITaskTypeValue;
  enabled: boolean;
  assignments: TaskAssignmentView[];
}

interface AssignmentDraft {
  id: string;
  credentialId: string;
  model: string;
  enabled: boolean;
}

export function RoutingTab() {
  const { t } = useI18n();
  const routing = useSWR<TaskRoutingView[]>(
    "/api/tob/admin/ai/config",
    swrFetcher
  );
  const credentials = useSWR<AiCredentialView[]>(
    "/api/tob/admin/ai/credentials",
    swrFetcher
  );

  if (routing.isLoading || credentials.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {AI_TASK_TYPES.map((taskType) => (
          <Skeleton key={taskType} className="h-[360px] rounded-lg" />
        ))}
      </div>
    );
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
  config,
  credentials,
  onSaved,
}: {
  taskType: AITaskTypeValue;
  config: TaskRoutingView | null;
  credentials: AiCredentialView[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const r = t.aiConfig.routing;
  const [enabled, setEnabled] = useState(true);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  const [pending, setPending] = useState(false);

  const compatibleCredentials = useMemo(
    () =>
      credentials.filter((credential) =>
        providerSupportsTask(credential.provider, taskType)
      ),
    [credentials, taskType]
  );

  useEffect(() => {
    setEnabled(config?.enabled ?? true);
    setAssignments(
      config?.assignments.map((assignment) => ({
        id: assignment.id,
        credentialId: assignment.credentialId,
        model: assignment.model,
        enabled: assignment.enabled,
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

  const save = async () => {
    if (enabled && assignments.filter((assignment) => assignment.enabled).length === 0) {
      toast.error(r.routeRequired);
      return;
    }
    if (assignments.some((assignment) => !assignment.model.trim())) {
      toast.error(t.aiConfig.modelRequired);
      return;
    }

    setPending(true);
    try {
      await api.post("/api/tob/admin/ai/config", {
        taskType,
        enabled,
        assignments: assignments.map((assignment) => ({
          credentialId: assignment.credentialId,
          model: assignment.model.trim(),
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
            <Switch
              id={`task-enabled-${taskType}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor={`task-enabled-${taskType}`} className="sr-only">
              {t.aiConfig.enabled}
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-4 pb-4">
        {assignments.length === 0 ? (
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
                              {item.name}
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
                        onChange={(event) =>
                          updateAssignment(index, { model: event.target.value })
                        }
                        list={`models-${taskType}-${assignment.id}`}
                      />
                      <datalist id={`models-${taskType}-${assignment.id}`}>
                        {models.map((model) => <option key={model} value={model} />)}
                      </datalist>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t pt-3">
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
          <Button size="sm" className="h-8" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.aiConfig.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
