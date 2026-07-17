"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError } from "@/lib/api/client";
import {
  CHANNEL_FIELDS,
  CHANNEL_TYPES,
  type ChannelType,
  type EndpointView,
} from "./channel-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormErrors = {
  name?: string;
  fields: Record<string, string>;
};

export function EndpointDialog({
  endpoint,
  defaultEmail,
  open,
  onOpenChange,
  onSaved,
}: {
  endpoint: EndpointView | null;
  defaultEmail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("email");
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FormErrors>({ fields: {} });
  const [pending, setPending] = useState(false);
  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!open) return;
    const nextName = endpoint?.name ?? "";
    const nextType = endpoint?.channelType ?? "email";
    const nextEnabled = endpoint?.enabled ?? true;
    const nextConfig = endpoint
      ? Object.fromEntries(
          Object.entries(endpoint.config).map(([key, value]) => [
            key,
            String(value ?? ""),
          ])
        )
      : defaultEmail
        ? { email: defaultEmail }
        : {};
    setName(nextName);
    setType(nextType);
    setEnabled(nextEnabled);
    setConfig(nextConfig);
    setErrors({ fields: {} });
    initialSnapshot.current = formSnapshot(
      nextName,
      nextType,
      nextEnabled,
      nextConfig
    );
  }, [defaultEmail, endpoint, open]);

  const fields = useMemo(() => CHANNEL_FIELDS[type], [type]);
  const isDirty =
    open && initialSnapshot.current !== formSnapshot(name, type, enabled, config);

  const requestOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next && isDirty && !window.confirm(t.notifChannels.discardChanges)) return;
    onOpenChange(next);
  };

  const submit = async () => {
    const nextErrors: FormErrors = { fields: {} };
    if (!name.trim()) nextErrors.name = t.notifChannels.nameRequired;
    for (const field of fields) {
      if (
        field.required &&
        !config[field.key]?.trim() &&
        !endpoint?.secretFields?.includes(field.key)
      ) {
        nextErrors.fields[field.key] = t.notifChannels.fieldRequired.replace(
          "{{field}}",
          t.notifChannels.fields[field.key]
        );
      }
    }
    if (nextErrors.name || Object.keys(nextErrors.fields).length > 0) {
      setErrors(nextErrors);
      focusFirstInvalid(
        nextErrors.name
          ? "endpoint-name"
          : `endpoint-${Object.keys(nextErrors.fields)[0]}`
      );
      return;
    }

    const payloadConfig = Object.fromEntries(
      fields
        .map((field) => [field.key, config[field.key]?.trim() ?? ""])
        .filter(([, value]) => value !== "")
    );
    setPending(true);
    try {
      if (endpoint) {
        await api.patch(`/api/tob/notification-endpoints/${endpoint.id}`, {
          name: name.trim(),
          enabled,
          config: payloadConfig,
        });
      } else {
        await api.post("/api/tob/notification-endpoints", {
          channelType: type,
          name: name.trim(),
          enabled,
          config: payloadConfig,
        });
      }
      toast.success(
        endpoint ? t.notifChannels.endpointUpdated : t.notifChannels.endpointCreated
      );
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : t.notifChannels.actionFailed
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>
            {endpoint
              ? t.notifChannels.editEndpoint
              : t.notifChannels.addEndpoint}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t.notifChannels.personalSubtitle}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-name">{t.notifChannels.name}</Label>
            <Input
              id="endpoint-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder={t.notifChannels.endpointNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "endpoint-name-error" : undefined}
            />
            {errors.name ? (
              <p id="endpoint-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>{t.notifChannels.type}</Label>
            <Select
              value={type}
              disabled={Boolean(endpoint)}
              onValueChange={(value) => {
                const nextType = value as ChannelType;
                setType(nextType);
                setConfig(
                  nextType === "email" && defaultEmail
                    ? { email: defaultEmail }
                    : {}
                );
                setErrors({ fields: {} });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((channelType) => (
                  <SelectItem key={channelType} value={channelType}>
                    {t.notifChannels.types[channelType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fields.map((field) => {
            const error = errors.fields[field.key];
            const errorId = `endpoint-${field.key}-error`;
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`endpoint-${field.key}`}>
                  {t.notifChannels.fields[field.key]}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id={`endpoint-${field.key}`}
                  type={field.secret ? "password" : field.key === "email" ? "email" : "text"}
                  value={config[field.key] ?? ""}
                  onChange={(event) => {
                    setConfig((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }));
                    if (error) {
                      setErrors((current) => ({
                        ...current,
                        fields: { ...current.fields, [field.key]: "" },
                      }));
                    }
                  }}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                />
                {error ? (
                  <p id={errorId} className="text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <Label htmlFor="endpoint-enabled">{t.notifChannels.enabled}</Label>
            <Switch
              id="endpoint-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => requestOpenChange(false)}
            disabled={pending}
          >
            {t.common.cancel}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formSnapshot(
  name: string,
  type: ChannelType,
  enabled: boolean,
  config: Record<string, string>
) {
  return JSON.stringify({
    name,
    type,
    enabled,
    config: Object.fromEntries(
      Object.entries(config)
        .filter(([, value]) => value !== "")
        .sort(([left], [right]) => left.localeCompare(right))
    ),
  });
}

function focusFirstInvalid(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
