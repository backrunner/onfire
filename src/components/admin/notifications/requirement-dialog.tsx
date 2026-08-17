"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import {
  CHANNEL_TYPES,
  REQUIREMENT_SCOPE_TYPES,
  TRIGGER_EVENTS,
  type ChannelType,
  type NotificationAgentView,
  type NotificationRequirementView,
  type NotificationTeamView,
  type RequirementScope,
  type TriggerEvent,
} from "./channel-meta";
import {
  focusPolicyField,
  PolicyCheckboxGrid,
  PolicyTargetSelect,
  toggleSet,
} from "./policy-checkbox-grid";
import { Button } from "@/components/ui/button";
import { ConfirmDiscardDialog } from "@/components/admin/confirm-discard-dialog";
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

export function RequirementDialog({
  productId,
  requirement,
  teams,
  agents,
  open,
  onOpenChange,
  onSaved,
}: {
  productId: string;
  requirement: NotificationRequirementView | null;
  teams: NotificationTeamView[];
  agents: NotificationAgentView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [scopeType, setScopeType] = useState<RequirementScope>("product");
  const [scopeTeamId, setScopeTeamId] = useState("");
  const [scopeUserId, setScopeUserId] = useState("");
  const [events, setEvents] = useState<Set<TriggerEvent>>(new Set());
  const [channels, setChannels] = useState<Set<ChannelType>>(new Set());
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!open) return;
    const nextName = requirement?.name ?? "";
    const nextEnabled = requirement?.enabled ?? true;
    const nextScopeType = requirement?.scopeType ?? "product";
    const nextTeamId = requirement?.scopeTeamId ?? "";
    const nextUserId = requirement?.scopeUserId ?? "";
    const nextEvents = new Set(requirement?.triggerEvents ?? []);
    const nextChannels = new Set(requirement?.channelTypes ?? []);
    setName(nextName);
    setEnabled(nextEnabled);
    setScopeType(nextScopeType);
    setScopeTeamId(nextTeamId);
    setScopeUserId(nextUserId);
    setEvents(nextEvents);
    setChannels(nextChannels);
    setErrors({});
    initialSnapshot.current = requirementSnapshot({
      name: nextName,
      enabled: nextEnabled,
      scopeType: nextScopeType,
      scopeTeamId: nextTeamId,
      scopeUserId: nextUserId,
      events: nextEvents,
      channels: nextChannels,
    });
  }, [open, requirement]);

  const isDirty =
    open &&
    initialSnapshot.current !==
      requirementSnapshot({
        name,
        enabled,
        scopeType,
        scopeTeamId,
        scopeUserId,
        events,
        channels,
      });

  const [confirmClose, setConfirmClose] = useState(false);
  const requestOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next && isDirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = t.notifChannels.requirementNameRequired;
    if (scopeType === "team" && !scopeTeamId) {
      nextErrors.target = t.notifChannels.targetRequired;
    }
    if (scopeType === "user" && !scopeUserId) {
      nextErrors.target = t.notifChannels.targetRequired;
    }
    if (events.size === 0) nextErrors.events = t.notifChannels.eventRequired;
    if (channels.size === 0) nextErrors.channels = t.notifChannels.methodRequired;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      focusPolicyField(
        nextErrors.name
          ? "requirement-name"
          : nextErrors.target
            ? scopeType === "team"
              ? "requirement-target-team"
              : "requirement-target-agent"
            : nextErrors.events
              ? "requirement-events"
              : "requirement-channels"
      );
      return;
    }

    const payload = {
      name: name.trim(),
      enabled,
      scopeType,
      scopeTeamId: scopeType === "team" ? scopeTeamId : null,
      scopeUserId: scopeType === "user" ? scopeUserId : null,
      triggerEvents: [...events],
      channelTypes: [...channels],
    };
    setPending(true);
    try {
      if (requirement) {
        await api.patch(
          `/api/tob/admin/notification-requirements/${requirement.id}`,
          payload
        );
      } else {
        await api.post("/api/tob/admin/notification-requirements", {
          productId,
          ...payload,
        });
      }
      toast.success(
        requirement
          ? t.notifChannels.requirementUpdated
          : t.notifChannels.requirementCreated
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
    <>
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>
            {requirement
              ? t.notifChannels.editRequirement
              : t.notifChannels.addRequirement}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t.notifChannels.requirements}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="requirement-name">{t.notifChannels.requirementName}</Label>
            <Input
              id="requirement-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder={t.notifChannels.requirementNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "requirement-name-error" : undefined}
            />
            {errors.name ? (
              <p id="requirement-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>{t.notifChannels.requirementScope}</Label>
            <Select
              value={scopeType}
              onValueChange={(value) => {
                setScopeType(value as RequirementScope);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REQUIREMENT_SCOPE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t.notifChannels.scopes[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scopeType === "team" ? (
            <PolicyTargetSelect
              id="requirement-target-team"
              label={t.notifChannels.targetTeam}
              value={scopeTeamId}
              onChange={(value) => {
                setScopeTeamId(value);
                setErrors((current) => ({ ...current, target: undefined }));
              }}
              placeholder={t.notifChannels.selectTeam}
              emptyLabel={t.notifChannels.noTeams}
              options={teams.map((team) => ({ value: team.id, label: team.name }))}
              error={errors.target}
            />
          ) : null}
          {scopeType === "user" ? (
            <PolicyTargetSelect
              id="requirement-target-agent"
              label={t.notifChannels.targetAgent}
              value={scopeUserId}
              onChange={(value) => {
                setScopeUserId(value);
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
            id="requirement-events"
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
            id="requirement-channels"
            label={t.notifChannels.requiredChannels}
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
            <Label htmlFor="requirement-enabled">{t.notifChannels.enabled}</Label>
            <Switch
              id="requirement-enabled"
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
    <ConfirmDiscardDialog
      open={confirmClose}
      onOpenChange={setConfirmClose}
      onConfirm={() => {
        setConfirmClose(false);
        onOpenChange(false);
      }}
      description={t.notifChannels.discardChanges}
    />
    </>
  );
}

function requirementSnapshot(value: {
  name: string;
  enabled: boolean;
  scopeType: RequirementScope;
  scopeTeamId: string;
  scopeUserId: string;
  events: Set<TriggerEvent>;
  channels: Set<ChannelType>;
}) {
  return JSON.stringify({
    ...value,
    events: [...value.events].sort(),
    channels: [...value.channels].sort(),
  });
}
