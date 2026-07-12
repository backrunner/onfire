"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError } from "@/lib/api/client";
import {
  CHANNEL_FIELDS,
  CHANNEL_TYPES,
  TRIGGER_EVENTS,
  type ChannelType,
  type ChannelView,
  type TriggerEvent,
} from "./channel-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ChannelDialogProps {
  productId: string;
  channel: ChannelView | null; // null = create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ChannelDialog({
  productId,
  channel,
  open,
  onOpenChange,
  onSaved,
}: ChannelDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("email");
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Set<TriggerEvent>>(new Set());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(channel?.name ?? "");
    setType(channel?.channelType ?? "email");
    setEnabled(channel?.enabled ?? true);
    setConfig(
      Object.fromEntries(
        Object.entries(channel?.config ?? {}).map(([k, v]) => [k, String(v ?? "")])
      )
    );
    setEvents(new Set((channel?.triggerEvents ?? []) as TriggerEvent[]));
  }, [open, channel]);

  const fields = useMemo(() => CHANNEL_FIELDS[type], [type]);

  const toggleEvent = (event: TriggerEvent, checked: boolean) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (checked) next.add(event);
      else next.delete(event);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t.notifChannels.nameRequired);
      return;
    }
    if (events.size === 0) {
      toast.error(t.notifChannels.eventsRequired);
      return;
    }
    const missingRequired = fields.some(
      (f) =>
        f.required &&
        !config[f.key]?.trim() &&
        !channel?.secretFields?.includes(f.key)
    );
    if (missingRequired) {
      toast.error(t.notifChannels.configRequired);
      return;
    }

    const payloadConfig = Object.fromEntries(
      fields
        .map((f) => [f.key, config[f.key]?.trim() ?? ""])
        .filter(([, v]) => v !== "")
    );

    setPending(true);
    try {
      if (channel) {
        await api.patch(`/api/tob/admin/notification-channels/${channel.id}`, {
          name: name.trim(),
          enabled,
          config: payloadConfig,
          triggerEvents: [...events],
        });
        toast.success(t.notifChannels.updated);
      } else {
        await api.post("/api/tob/admin/notification-channels", {
          productId,
          channelType: type,
          name: name.trim(),
          enabled,
          config: payloadConfig,
          triggerEvents: [...events],
        });
        toast.success(t.notifChannels.created);
      }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {channel ? t.notifChannels.editChannel : t.notifChannels.addChannel}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t.notifChannels.subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">{t.notifChannels.name}</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.notifChannels.namePlaceholder}
              className="h-8"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t.notifChannels.type}</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as ChannelType);
                if (!channel) setConfig({});
              }}
              disabled={Boolean(channel)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {t.notifChannels.types[ct]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`cfg-${field.key}`}>
                {t.notifChannels.fields[field.key]}
                {field.required && <span className="text-red-500"> *</span>}
              </Label>
              <Input
                id={`cfg-${field.key}`}
                type={field.secret ? "password" : "text"}
                value={config[field.key] ?? ""}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="h-8"
                autoComplete="off"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>{t.notifChannels.triggerEvents}</Label>
            <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
              {TRIGGER_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={events.has(event)}
                    onCheckedChange={(checked) =>
                      toggleEvent(event, checked === true)
                    }
                  />
                  {t.notifChannels.events[event]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="channel-enabled">{t.notifChannels.enabled}</Label>
            <Switch
              id="channel-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t.common.cancel}
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
