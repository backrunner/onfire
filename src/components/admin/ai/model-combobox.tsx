"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function ModelCombobox({
  id,
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
  placeholder,
  refreshLabel,
  customHint,
  onOpen,
  onRefresh,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  refreshLabel: string;
  customHint: string;
  onOpen?: () => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.toLowerCase().includes(normalized));
  }, [options, query]);

  const openPopover = () => {
    if (open) return;
    setQuery("");
    setOpen(true);
    onOpen?.();
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          onOpen?.();
        }
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div className="relative">
          <Input
            id={id}
            className="h-8 w-full pr-7"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
              setQuery(event.target.value);
              openPopover();
            }}
            onFocus={openPopover}
          />
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={refreshLabel}
              className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          </PopoverPrimitive.Trigger>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 flex max-h-64 w-(--radix-popover-anchor-width) min-w-40 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {customHint}
              </p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      option === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t px-1 py-1">
            <button
              type="button"
              disabled={loading}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onRefresh?.()}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {refreshLabel}
            </button>
            {filtered.length > 0 && (
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground/80">
                {customHint}
              </p>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
