"use client";

import { useId } from "react";
import { useI18n } from "@/lib/i18n";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function CloseNotificationOption({ checked, onCheckedChange, disabled }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{t.tickets.actions.notifyCustomer}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {t.tickets.actions.notifyCustomerHint}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange}
        disabled={disabled} aria-describedby={`${id}-hint`} />
    </div>
  );
}
