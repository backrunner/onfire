"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { api, qs, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
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
  endpointUrl: string | null;
  timeoutMs: number;
  secretConfigured: boolean;
}

const GLOBAL = "__global__";

export function SpamFilterManagement({ tenantId }: { tenantId?: string }) {
  const { t } = useI18n();
  const m = t.management.spamFilter;
  const { can } = useMe();
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
  const [form, setForm] = useState({ mode: "disabled", endpointUrl: "", authSecret: "", timeoutMs: "3000" });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      mode: data.mode,
      endpointUrl: data.endpointUrl ?? "",
      authSecret: "",
      timeoutMs: String(data.timeoutMs),
    });
  }, [data]);

  const save = async () => {
    setPending(true);
    try {
      await api.patch("/api/tob/admin/spam-filter", {
        ...(scope !== GLOBAL ? { tenantId: scope } : {}),
        mode: form.mode,
        endpointUrl: form.mode === "custom" ? form.endpointUrl.trim() : null,
        ...(form.authSecret.trim() ? { authSecret: form.authSecret.trim() } : {}),
        timeoutMs: Number(form.timeoutMs) || 3000,
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
    <ManagerPanel
      title={m.title}
      description={m.description}
      actions={<Button size="sm" className="h-8" onClick={() => void save()} disabled={pending || !data}><Save className="mr-1.5 size-3.5" />{pending ? t.common.loading : t.common.save}</Button>}
    >
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        {isSuperAdmin && !tenantId && (
          <FormField label={m.scope}>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={GLOBAL}>{m.global}</SelectItem>{(tenants ?? []).map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
        )}
        <FormField label={m.mode}>
          <Select value={form.mode} onValueChange={(mode) => setForm((current) => ({ ...current, mode }))}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scope !== GLOBAL && <SelectItem value="inherit">{m.inherit}</SelectItem>}
              <SelectItem value="disabled">{m.disabled}</SelectItem>
              <SelectItem value="custom">{m.custom}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {form.mode === "custom" && (
          <>
            <FormField label={m.endpoint}><Input className="h-8" value={form.endpointUrl} onChange={(event) => setForm((current) => ({ ...current, endpointUrl: event.target.value }))} placeholder="https://spam.example.com/classify" /></FormField>
            <FormField label={m.secret} hint={data?.secretConfigured ? m.secretConfigured : m.secretHint}><Input type="password" className="h-8" value={form.authSecret} onChange={(event) => setForm((current) => ({ ...current, authSecret: event.target.value }))} /></FormField>
            <FormField label={m.timeout}><Input type="number" min={500} max={10000} className="h-8" value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))} /></FormField>
          </>
        )}
      </div>
    </ManagerPanel>
  );
}
