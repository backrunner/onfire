"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface ModelOption {
  id: string;
  name?: string;
  disabled?: boolean;
  description?: string;
}

export function ModelCombobox({
  id,
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
  placeholder,
  label,
  refreshLabel,
  customHint,
  searchLabel,
  emptyLabel,
  loadingLabel,
  onOpen,
  onRefresh,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ModelOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  refreshLabel: string;
  customHint: string;
  searchLabel: string;
  emptyLabel: string;
  loadingLabel: string;
  onOpen?: () => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(true);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.id} ${option.name ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);
  const activeIndex = filtered.findIndex((option) => option.id === activeId && !option.disabled);
  const activeOptionId = activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  const openPopover = () => {
    if (open) return;
    setQuery("");
    setActiveId(null);
    setOpen(true);
    onOpen?.();
  };

  const selectOption = (option: ModelOption) => {
    if (option.disabled) return;
    onChange(option.id);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPopover();
      const enabled = filtered.filter((option) => !option.disabled);
      if (!enabled.length) return;
      const index = enabled.findIndex((option) => option.id === activeId);
      const nextIndex = index < 0 ? (event.key === "ArrowDown" ? 0 : enabled.length - 1)
        : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      setActiveId(enabled[nextIndex].id);
    } else if (event.key === "Enter" && open) {
      // Searching never submits the surrounding form or changes its model.
      event.preventDefault();
      if (activeIndex >= 0) selectOption(filtered[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setActiveId(null);
          onOpen?.();
        }
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div className="relative">
          <Input
            id={id}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open ? activeOptionId : undefined}
            className="h-8 w-full pr-7"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
              openPopover();
              setQuery(event.target.value);
              setActiveId(null);
            }}
            onClick={openPopover}
            onKeyDown={handleKeyDown}
          />
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={label}
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
          onOpenAutoFocus={(event) => { event.preventDefault(); restoreFocus.current = true; }}
          onInteractOutside={() => { restoreFocus.current = false; }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocus.current) inputRef.current?.focus();
          }}
          className="z-50 flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] min-w-40 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="relative shrink-0 border-b p-2">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={searchLabel}
              aria-controls={listId}
              aria-activedescendant={activeOptionId}
              value={query}
              placeholder={searchLabel}
              className="h-8 pl-7 text-xs"
              onChange={(event) => { setQuery(event.target.value); setActiveId(null); }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div id={listId} role="listbox" aria-label={label} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p role="status" className="px-2 py-3 text-center text-xs text-muted-foreground">
                {loading ? loadingLabel : emptyLabel}
              </p>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.id}
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  disabled={option.disabled}
                  tabIndex={-1}
                  className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:opacity-50", activeIndex === index && "bg-accent text-accent-foreground")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      option.id === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block break-words [overflow-wrap:anywhere]">{option.id}</span>
                    {option.name && <span className="block break-words text-muted-foreground">{option.name}</span>}
                    {option.description && <span className="block text-muted-foreground">{option.description}</span>}
                  </span>
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
