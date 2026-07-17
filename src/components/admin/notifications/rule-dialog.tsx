"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import {
  CHANNEL_TYPES,
  RECIPIENT_TYPES,
  TRIGGER_EVENTS,
  type ChannelType,
  type NotificationAgentView,
  type NotificationRuleView,
  type NotificationTeamView,
  type RecipientType,
  type TriggerEvent,
} from "./channel-meta";
import {
  focusPolicyField,
  PolicyCheckboxGrid,
  PolicyTargetSelect,
  toggleSet,
} from "./policy-checkbox-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type FormErrors = {
  name?: string;
  target?: string;
  events?: string;
  channels?: string;
};

export function RuleDialog({
  productId,
  rule,
  teams,
  agents,
  open,
  onOpenChange,
  onSaved,
}: {
  productId: string;
  rule: NotificationRuleView | null;
  teams: NotificationTeamView[];
  agents: NotificationAgentView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [recipientType, setRecipientType] = useState<RecipientType>("assignee");
  const [recipientTeamId, setRecipientTeamId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [events, setEvents] = useState<Set<TriggerEvent>>(new Set());
  const [channels, setChannels] = useState<Set<ChannelType>>(new Set());
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!open) return;
    const nextName = rule?.name ?? "";
    const nextEnabled = rule?.enabled ?? true;
    const nextRecipientType = rule?.recipientType ?? "assignee";
    const nextTeamId = rule?.recipientTeamId ?? "";
    const nextUserId = rule?.recipientUserId ?? "";
    const nextEvents = new Set(rule?.triggerEvents ?? []);
    const nextChannels = new Set(rule?.channelTypes ?? []);
    setName(nextName);
    setEnabled(nextEnabled);
    setRecipientType(nextRecipientType);
    setRecipientTeamId(nextTeamId);
    setRecipientUserId(nextUserId);
    setEvents(nextEvents);
    setChannels(nextChannels);
    setErrors({});
    initialSnapshot.current = ruleSnapshot({
      name: nextName,
      enabled: nextEnabled,
      recipientType: nextRecipientType,
      recipientTeamId: nextTeamId,
      recipientUserId: nextUserId,
      events: nextEvents,
      channels: nextChannels,
    });
  }, [open, rule]);

  const isDirty =
    open &&
    initialSnapshot.current !==
      ruleSnapshot({
        name,
        enabled,
        recipientType,
        recipientTeamId,
        recipientUserId,
        events,
        channels,
      });

  const requestOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next && isDirty && !window.confirm(t.notifChannels.discardChanges)) return;
    onOpenChange(next);
  };

  const submit = async () => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = t.notifChannels.ruleNameRequired;
    if (recipientType === "team" && !recipientTeamId) {
      nextErrors.target = t.notifChannels.targetRequired;
    }
    if (recipientType === "user" && !recipientUserId) {
      nextErrors.target = t.notifChannels.targetRequired;
    }
    if (events.size === 0) nextErrors.events = t.notifChannels.eventRequired;
    if (channels.size === 0) nextErrors.channels = t.notifChannels.methodRequired;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusPolicyField(
        nextErrors.name
          ? "rule-name"
          : nextErrors.target
            ? recipientType === "team"
              ? "rule-target-team"
              : "rule-target-agent"
            : nextErrors.events
              ? "rule-events"
              : "rule-channels"
      );
      return;
    }

    const payload = {
      name: name.trim(),
      enabled,
      recipientType,
      recipientTeamId: recipientType === "team" ? recipientTeamId : null,
      recipientUserId: recipientType === "user" ? recipientUserId : null,
      triggerEvents: [...events],
      channelTypes: [...channels],
    };
    setPending(true);
    try {
      if (rule) {
        await api.patch(`/api/tob/admin/notification-rules/${rule.id}`, payload);
      } else {
        await api.post("/api/tob/admin/notification-rules", {
          productId,
          ...payload,
        });
      }
      toast.success(rule ? t.notifChannels.ruleUpdated : t.notifChannels.ruleCreated);
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
      <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>
            {rule ? t.notifChannels.editRule : t.notifChannels.addRule}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t.notifChannels.subtitle}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">{t.notifChannels.ruleName}</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder={t.notifChannels.ruleNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "rule-name-error" : undefined}
            />
            {errors.name ? (
              <p id="rule-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>{t.notifChannels.recipient}</Label>
            <Select
              value={recipientType}
              onValueChange={(value) => {
                setRecipientType(value as RecipientType);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECIPIENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t.notifChannels.recipients[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {recipientType === "team" ? (
            <PolicyTargetSelect
              id="rule-target-team"
              label={t.notifChannels.targetTeam}
              value={recipientTeamId}
              onChange={(value) => {
                setRecipientTeamId(value);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
              placeholder={t.notifChannels.selectTeam}
              emptyLabel={t.notifChannels.noTeams}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              error={errors.target}
            />
          ) : null}
          {recipientType === "user" ? (
            <PolicyTargetSelect
              id="rule-target-agent"
              label={t.notifChannels.targetAgent}
              value={recipientUserId}
              onChange={(value) => {
                setRecipientUserId(value);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
              placeholder={t.notifChannels.selectAgent}
              emptyLabel={t.notifChannels.noAgents}
              options={agents.map((agent) => ({
                value: agent.userId,
                label: agent.displayName,
              }))}
              error={errors.target}
            />
          ) : null}
          <PolicyCheckboxGrid
            id="rule-events"
            label={t.notifChannels.triggerEvents}
            values={TRIGGER_EVENTS}
            selected={events}
            onToggle={(value, checked) => {
              setEvents((current) => toggleSet(current, value, checked));
              if (errors.events) setErrors((current) => ({ ...current, events: undefined }));
            }}
            render={(value) => t.notifChannels.events[value]}
            error={errors.events}
          />
          <PolicyCheckboxGrid
            id="rule-channels"
            label={t.notifChannels.deliveryChannels}
            values={CHANNEL_TYPES}
            selected={channels}
            onToggle={(value, checked) => {
              setChannels((current) => toggleSet(current, value, checked));
              if (errors.channels) {
                setErrors((current) => ({ ...current, channels: undefined }));
              }
            }}
            render={(value) => t.notifChannels.types[value]}
            error={errors.channels}
          />
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <Label htmlFor="rule-enabled">{t.notifChannels.enabled}</Label>
            <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
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

function ruleSnapshot(value: {
  name: string;
  enabled: boolean;
  recipientType: RecipientType;
  recipientTeamId: string;
  recipientUserId: string;
  events: Set<TriggerEvent>;
  channels: Set<ChannelType>;
}) {
  return JSON.stringify({
    ...value,
    events: [...value.events].sort(),
    channels: [...value.channels].sort(),
  });
}
