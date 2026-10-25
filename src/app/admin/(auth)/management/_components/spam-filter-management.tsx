"use client";

import { FilteredInputs } from "./filtered-inputs";
import { RoutingTab } from "@/components/admin/ai/routing-tab";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { api, qs, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { spamFilterSpecUrl } from "@/lib/onfire-docs";
import {
  SPAM_FILTER_CUSTOM_HEADERS_EXAMPLE,
  SPAM_FILTER_CUSTOM_REQUEST_EXAMPLE,
  SPAM_FILTER_CUSTOM_RESPONSE_EXAMPLE,
  SPAM_FILTER_PROVIDERS,
  spamFilterProviderDef,
  type SpamFilterProvider,
} from "@/lib/spam-filter-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField, ManagerPanel, errorMessage } from "./manager-ui";

interface TenantRef { id: string; name: string }
interface SpamConfigView {
  mode: "inherit" | "disabled" | "custom";
  provider?: SpamFilterProvider;
  endpointUrl: string | null;
  timeoutMs: number;
  spamThreshold: number;
  suspectThreshold: number;
  secretConfigured: boolean;
  aiRouteConfigured?: boolean;
}

const GLOBAL = "__global__";

export function SpamFilterManagement({ tenantId }: { tenantId?: string }) {
  const { t, language } = useI18n();
  const m = t.management.spamFilter;
  const { can, me } = useMe();
  const isSuperAdmin = can("tenant.manage");
  const { data: tenants } = useSWR<TenantRef[]>(
    isSuperAdmin ? "/api/tob/admin/tenants" : null,
    swrFetcher
  );
  const [scope, setScope] = useState(tenantId ?? GLOBAL);
  const configKey = `/api/tob/admin/spam-filter${qs({
    tenantId: scope === GLOBAL ? undefined : scope,
  })}`;
  const { data, mutate } = useSWR<SpamConfigView>(configKey, swrFetcher);
  const [form, setForm] = useState({
    mode: "disabled",
    provider: "postmark" as SpamFilterProvider,
    endpointUrl: "",
    authSecret: "",
    timeoutMs: "3000",
    spamThreshold: "0.9",
    suspectThreshold: "0.5",
  });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      mode: data.mode,
      provider: data.provider ?? "custom",
      endpointUrl: data.endpointUrl ?? "",
      authSecret: "",
      timeoutMs: String(data.timeoutMs),
      spamThreshold: String(data.spamThreshold ?? 0.9),
      suspectThreshold: String(data.suspectThreshold ?? 0.5),
    });
  // Route health refreshes must not discard the unsaved filtering selection.
  }, [scope, data?.mode, data?.provider, data?.endpointUrl, data?.timeoutMs, data?.spamThreshold, data?.suspectThreshold]);

  const provider = spamFilterProviderDef(form.provider);
  const labels = m.providers;
  const save = async () => {
    if (me?.preview) return;
    setPending(true);
    try {
      await api.patch("/api/tob/admin/spam-filter", {
        ...(scope !== GLOBAL ? { tenantId: scope } : {}),
        mode: form.mode,
        provider: form.mode === "custom" ? form.provider : undefined,
        endpointUrl:
          form.mode === "custom" && provider.requiresEndpoint
            ? form.endpointUrl.trim()
            : null,
        ...(form.authSecret.trim() ? { authSecret: form.authSecret.trim() } : {}),
        timeoutMs: Number(form.timeoutMs) || 3000,
        spamThreshold: Number(form.spamThreshold),
        suspectThreshold: Number(form.suspectThreshold),
      });
      toast.success(t.management.toastUpdated);
      setForm((current) => ({ ...current, authSecret: "" }));
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
    <ManagerPanel
      title={m.title}
      description={m.description}
    >
      <fieldset disabled={Boolean(me?.preview)} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {isSuperAdmin && !tenantId && (
          <FormField label={m.scope}>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>{m.global}</SelectItem>
                {(tenants ?? []).map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField label={m.mode}>
          <Select value={form.mode} onValueChange={(mode) => setForm((current) => ({ ...current, mode }))}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scope !== GLOBAL && <SelectItem value="inherit">{m.inherit}</SelectItem>}
              <SelectItem value="disabled">{m.disabled}</SelectItem>
              <SelectItem value="custom">{m.enabled}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {form.mode === "custom" && (
          <>
            <FormField label={m.provider} hint={form.provider === "ai" ? undefined : labels[form.provider].description}>
              <Select
                value={form.provider}
                onValueChange={(next) =>
                  setForm((current) => ({ ...current, provider: next as SpamFilterProvider }))
                }
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPAM_FILTER_PROVIDERS.map((id) => (
                    <SelectItem key={id} value={id}>{labels[id].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {form.provider === "ai" && (
              <>
                <div className="col-span-full min-w-0 border-t pt-4"><RoutingTab key={scope} scope={scope === GLOBAL ? "system" : "tenant"} tenantId={scope === GLOBAL ? undefined : scope} taskTypes={["spam"]} embedded readOnly={Boolean(me?.preview)} onSaved={() => { void mutate(); }} /></div>
                <details className="col-span-full border-t pt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{m.advanced}</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
                <FormField label={m.spamThreshold}>
                  <Input type="number" min={0} max={1} step={0.01} className="h-8" value={form.spamThreshold} onChange={(event) => setForm((current) => ({ ...current, spamThreshold: event.target.value }))} />
                </FormField>
                <FormField label={m.suspectThreshold} hint={m.suspectHint}>
                  <Input type="number" min={0} max={1} step={0.01} className="h-8" value={form.suspectThreshold} onChange={(event) => setForm((current) => ({ ...current, suspectThreshold: event.target.value }))} />
                </FormField>
                <FormField label={m.timeout}><Input type="number" min={500} max={10000} className="h-8" value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))} /></FormField>
                <a className="self-end text-xs text-muted-foreground underline underline-offset-2" href={spamFilterSpecUrl(language, "decision-api")} target="_blank" rel="noreferrer">{m.docs}</a>
                </div></details>
              </>
            )}
            {provider.requiresEndpoint && (
              <FormField
                label={provider.endpointKind === "site" ? m.siteUrl : m.endpoint}
                hint={provider.endpointKind === "site" ? m.siteUrlHint : undefined}
              >
                <Input
                  className="h-8"
                  value={form.endpointUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endpointUrl: event.target.value }))
                  }
                  placeholder={
                    provider.endpointKind === "site"
                      ? "https://www.example.com"
                      : "https://spam.example.com/classify"
                  }
                />
              </FormField>
            )}
            {(provider.requiresSecret || provider.secretOptional) && (
              <FormField
                label={provider.id === "custom" ? m.secret : m.apiKey}
                hint={
                  data?.secretConfigured
                    ? m.secretConfigured
                    : provider.secretOptional
                      ? m.apiKeyOptional
                      : m.apiKeyHint
                }
              >
                <Input
                  type="password"
                  className="h-8"
                  value={form.authSecret}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, authSecret: event.target.value }))
                  }
                />
              </FormField>
            )}
            {form.provider !== "ai" && <FormField label={m.timeout}>
              <Input
                type="number"
                min={500}
                max={10000}
                className="h-8"
                value={form.timeoutMs}
                onChange={(event) =>
                  setForm((current) => ({ ...current, timeoutMs: event.target.value }))
                }
              />
            </FormField>}
            {form.provider !== "ai" && (provider.docsUrl || form.provider === "custom") && (
              <div className="col-span-full space-y-1 text-xs text-muted-foreground">
                <a
                  href={form.provider === "custom" ? spamFilterSpecUrl(language, "custom-spam-api") : provider.docsUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {m.docs}
                </a>
                {labels[form.provider].mapping && <p>{labels[form.provider].mapping}</p>}
              </div>
            )}
            {form.provider === "custom" && (
              <div className="col-span-full space-y-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{m.protocolTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.protocolHint}</p>
                </div>
                <JsonSample title={m.headersExample} value={SPAM_FILTER_CUSTOM_HEADERS_EXAMPLE} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <JsonSample title={m.requestExample} value={SPAM_FILTER_CUSTOM_REQUEST_EXAMPLE} />
                  <JsonSample title={m.responseExample} value={SPAM_FILTER_CUSTOM_RESPONSE_EXAMPLE} />
                </div>
              </div>
            )}
          </>
        )}
      </fieldset>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{form.mode === "custom" && form.provider === "ai" && data?.aiRouteConfigured === false ? m.aiRouteMissing : ""}</p><Button size="sm" className="h-8 shrink-0" onClick={() => void save()} disabled={pending || !data || Boolean(me?.preview) || (form.mode === "custom" && form.provider === "ai" && data.aiRouteConfigured !== true)}><Save className="mr-1.5 size-3.5" />{pending ? t.common.loading : t.common.save}</Button></div>
    </ManagerPanel>
    <FilteredInputs key={scope} tenantId={scope === GLOBAL ? undefined : scope} />
    </div>
  );
}

function JsonSample({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-[11px] leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
