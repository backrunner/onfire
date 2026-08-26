"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  ALL_AI_PROVIDERS,
  type AIProviderValue,
  type OpenAIApiModeValue,
} from "@/lib/ai-config";
import { PROVIDER_PRESETS } from "./provider-presets";
import { aiScopeQuery } from "./scope";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AiCredentialsSkeleton } from "./ai-loading-skeletons";
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

export interface AiCredentialView {
  id: string;
  name: string;
  provider: AIProviderValue;
  apiMode: OpenAIApiModeValue;
  hasKey: boolean;
  baseUrl: string | null;
  enabled: boolean;
  cooldownSeconds: number;
  blockedUntil: string | null;
  failureCount: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  scope?: "system" | "tenant" | "product";
  inherited?: boolean;
}

type FormState = {
  name: string;
  provider: AIProviderValue;
  apiMode: OpenAIApiModeValue;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  cooldownSeconds: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  provider: "openai",
  apiMode: "responses",
  apiKey: "",
  baseUrl: "",
  enabled: true,
  cooldownSeconds: "60",
};

export function CredentialsTab({
  scope = "system",
  tenantId,
  productId,
}: {
  scope?: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
}) {
  const { t } = useI18n();
  const c = t.aiConfig.credentials;
  const scopeQuery = aiScopeQuery({ scope, tenantId, productId });
  const { data, error, isLoading, mutate } = useSWR<AiCredentialView[]>(
    `/api/tob/admin/ai/credentials${scopeQuery}`,
    swrFetcher
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = useMemo(
    () => data?.find((credential) => credential.id === selectedId) ?? null,
    [data, selectedId]
  );

  useEffect(() => {
    if (!creating && !selectedId && data?.length) {
      setSelectedId(data[0].id);
    }
  }, [creating, data, selectedId]);

  useEffect(() => {
    if (creating) {
      setForm(EMPTY_FORM);
      return;
    }
    if (selected) {
      setForm({
        name: selected.name,
        provider: selected.provider,
        apiMode: selected.apiMode,
        apiKey: "",
        baseUrl: selected.baseUrl ?? "",
        enabled: selected.enabled,
        cooldownSeconds: String(selected.cooldownSeconds),
      });
    }
  }, [creating, selected]);

  const startCreate = () => {
    setSelectedId(null);
    setCreating(true);
  };

  const selectCredential = (id: string) => {
    setCreating(false);
    setSelectedId(id);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(c.nameRequired);
      return;
    }
    if (creating && !form.apiKey.trim()) {
      toast.error(t.aiConfig.apiKeyRequired);
      return;
    }
    const cooldownSeconds = Number(form.cooldownSeconds);
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0) {
      toast.error(c.cooldownInvalid);
      return;
    }

    setPending(true);
    try {
      const payload = {
        name: form.name.trim(),
        provider: form.provider,
        apiMode: form.apiMode,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        baseUrl: form.baseUrl.trim() || null,
        enabled: form.enabled,
        cooldownSeconds,
      };
      if (creating) {
        const result = await api.post<{ id: string }>(
          `/api/tob/admin/ai/credentials${scopeQuery}`,
          payload
        );
        setCreating(false);
        setSelectedId(result.id);
      } else if (selected) {
        await api.patch(`/api/tob/admin/ai/credentials/${selected.id}`, payload);
      }
      await mutate();
      toast.success(c.saved);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : c.saveFailed);
    } finally {
      setPending(false);
    }
  };

  const resetHealth = async () => {
    if (!selected) return;
    setPending(true);
    try {
      await api.patch(`/api/tob/admin/ai/credentials/${selected.id}`, {
        resetHealth: true,
      });
      await mutate();
      toast.success(c.healthReset);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : c.saveFailed);
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setPending(true);
    try {
      await api.delete(`/api/tob/admin/ai/credentials/${selected.id}`);
      setSelectedId(null);
      setDeleting(false);
      await mutate();
      toast.success(c.deleted);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : c.deleteFailed);
    } finally {
      setPending(false);
    }
  };

  if (isLoading) {
    return <AiCredentialsSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
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
    <>
      <div className="grid items-stretch gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-full min-h-[320px] gap-0 py-0 lg:min-h-[520px]">
          <CardHeader className="flex items-center justify-between px-4 py-4">
            <div>
              <CardTitle className="text-sm">{c.title}</CardTitle>
              <CardDescription className="text-xs">{c.subtitle}</CardDescription>
            </div>
            <Button size="sm" className="h-8" onClick={startCreate}>
              <Plus className="size-4" />
              {c.add}
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
            {(data?.length ?? 0) === 0 ? (
              <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2 px-8 text-center lg:min-h-[420px]">
                <KeyRound className="size-7 text-muted-foreground/45" />
                <p className="text-sm font-medium">{c.empty}</p>
                <p className="text-xs text-muted-foreground">{c.emptyHint}</p>
              </div>
            ) : (
              <div className="divide-y border-t">
                {data?.map((credential) => (
                  <CredentialRow
                    key={credential.id}
                    credential={credential}
                    selected={!creating && selectedId === credential.id}
                    onClick={() => selectCredential(credential.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full min-h-[320px] gap-0 py-0 lg:min-h-[520px]">
          {creating || selected ? (
            <>
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-sm">
                  {creating ? c.createTitle : c.editTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {creating ? c.createHint : c.editHint}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="credential-name" className="text-xs">{c.name}</Label>
                  <Input
                    id="credential-name"
                    className="h-8"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder={c.namePlaceholder}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t.aiConfig.provider}</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        provider: value as AIProviderValue,
                        apiMode: value === "openrouter" ? "chat" : form.apiMode,
                        baseUrl: "",
                      })
                    }
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_AI_PROVIDERS.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {t.aiConfig.providers[provider]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credential-cooldown" className="text-xs">{c.cooldown}</Label>
                  <Input
                    id="credential-cooldown"
                    className="h-8"
                    type="number"
                    min={0}
                    max={86400}
                    value={form.cooldownSeconds}
                    onChange={(event) => setForm({ ...form, cooldownSeconds: event.target.value })}
                  />
                </div>
                {(form.provider === "openai" || form.provider === "openrouter") && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">{t.aiConfig.apiMode}</Label>
                    <Select
                      value={form.apiMode}
                      onValueChange={(value) =>
                        setForm({ ...form, apiMode: value as OpenAIApiModeValue })
                      }
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="responses" disabled={form.provider === "openrouter"}>{t.aiConfig.apiModes.responses}</SelectItem>
                        <SelectItem value="chat">{t.aiConfig.apiModes.chat}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="credential-key" className="text-xs">{t.aiConfig.apiKey}</Label>
                  <Input
                    id="credential-key"
                    type="password"
                    autoComplete="off"
                    className="h-8"
                    value={form.apiKey}
                    onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                    placeholder={selected?.hasKey ? t.aiConfig.apiKeyConfigured : t.aiConfig.apiKeyPlaceholder}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="credential-url" className="text-xs">{t.aiConfig.baseUrl}</Label>
                  <Input
                    id="credential-url"
                    className="h-8"
                    value={form.baseUrl}
                    onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                    placeholder={PROVIDER_PRESETS[form.provider].baseUrl}
                  />
                </div>

                {!creating && selected?.lastFailureMessage && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs sm:col-span-2">
                    <div className="flex items-start gap-2">
                      <Ban className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{c.lastFailure}</p>
                        <p className="mt-0.5 break-words text-muted-foreground">{selected.lastFailureMessage}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t pt-4 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="credential-enabled"
                      checked={form.enabled}
                      onCheckedChange={(enabled) => setForm({ ...form, enabled })}
                    />
                    <Label htmlFor="credential-enabled" className="text-xs">{t.aiConfig.enabled}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    {!creating && selected && (
                      <>
                        {(selected.blockedUntil || selected.failureCount > 0) && (
                          <Button variant="outline" size="sm" className="h-8" onClick={resetHealth} disabled={pending}>
                            <RotateCcw className="size-4" />
                            {c.resetHealth}
                          </Button>
                        )}
                        <Button variant="outline" size="icon" className="size-8 text-destructive" onClick={() => setDeleting(true)} disabled={pending} aria-label={t.common.delete}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" className="h-8" onClick={save} disabled={pending}>
                      {pending && <Loader2 className="size-4 animate-spin" />}
                      {t.aiConfig.save}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center lg:min-h-[520px]">
              <KeyRound className="size-7 text-muted-foreground/45" />
              <p className="text-sm font-medium">{c.select}</p>
              <p className="text-xs text-muted-foreground">{c.selectHint}</p>
            </CardContent>
          )}
        </Card>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {c.deleteHint.replace("{{name}}", selected?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CredentialRow({
  credential,
  selected,
  onClick,
}: {
  credential: AiCredentialView;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const c = t.aiConfig.credentials;
  const blocked = Boolean(
    credential.blockedUntil && Date.parse(credential.blockedUntil) > Date.now()
  );
  const status = !credential.enabled
    ? c.disabled
    : blocked
      ? c.coolingDown
      : c.available;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
        selected && "bg-accent"
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        {blocked ? (
          <Ban className="size-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className={cn("size-4", credential.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{credential.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {t.aiConfig.providers[credential.provider]} · {c.usage.replace("{{count}}", String(credential.usageCount))}
        </span>
      </span>
      <span className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
        blocked
          ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
          : credential.enabled
            ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
            : "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400"
      )}>{status}</span>
    </button>
  );
}
