"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NO_OPTION = "__none__";

export function PolicyCheckboxGrid<T extends string>({
  id,
  label,
  values,
  selected,
  onToggle,
  render,
  error,
}: {
  id: string;
  label: string;
  values: readonly T[];
  selected: Set<T>;
  onToggle: (value: T, checked: boolean) => void;
  render: (value: T) => string;
  error?: string;
}) {
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label id={labelId}>{label}</Label>
      <div
        id={id}
        role="group"
        aria-labelledby={labelId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
        className={cn(
          "grid grid-cols-2 gap-1 rounded-md border p-2 sm:grid-cols-3",
          error && "border-destructive"
        )}
      >
        {values.map((value) => (
          <label
            key={value}
            className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-tight hover:bg-muted/60"
          >
            <Checkbox
              checked={selected.has(value)}
              onCheckedChange={(checked) => onToggle(value, checked === true)}
            />
            <span className="min-w-0 break-words">{render(value)}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PolicyTargetSelect({
  id,
  label,
  value,
  onChange,
  placeholder,
  emptyLabel,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length > 0 ? (
            options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))
          ) : (
            <SelectItem value={NO_OPTION} disabled>
              {emptyLabel}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function toggleSet<T>(current: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

export function focusPolicyField(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
