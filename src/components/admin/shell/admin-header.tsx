"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Clock3, Glasses, Menu, Search, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/lib/auth";
import { usePreviewIdentity } from "@/lib/hooks/use-preview-identity";
import { PreviewIdentityDialog } from "./preview-identity-dialog";
import { Badge } from "@/components/ui/badge";
import { swrFetcher, qs } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";

interface TicketSuggestion {
  id: string;
  subject: string;
  customerEmail: string | null;
  customerLabel: string | null;
  status: TicketStatus;
  updatedAt: string;
}

interface SuggestResponse {
  tickets: TicketSuggestion[];
}

export function AdminHeader({ onMobileMenu }: { onMobileMenu: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const { me } = useMe();
  const { preview, canStart, stop } = usePreviewIdentity();
  const [previewOpen, setPreviewOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    router.prefetch("/admin/search");
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggestKey =
    searchOpen && debouncedQuery.length >= 2
      ? `/api/tob/search/suggest${qs({ q: debouncedQuery })}`
      : null;
  const { data: suggestions, isLoading: suggestionsLoading } =
    useSWR<SuggestResponse>(suggestKey, swrFetcher, {
      keepPreviousData: true,
      revalidateOnFocus: false,
    });

  useEffect(() => {
    for (const ticket of suggestions?.tickets ?? []) {
      router.prefetch(`/admin/tickets/${ticket.id}`);
    }
  }, [router, suggestions]);

  const submitSearch = () => {
    const q = query.trim();
    setSearchOpen(false);
    router.push(q ? `/admin/search${qs({ q })}` : "/admin/search");
  };

  const initials = (me?.user.displayName || me?.user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sticky top-0 z-40">
      {preview && (
        <div className="flex h-8 items-center justify-center gap-2 bg-amber-400 px-4 text-amber-950 shadow-sm dark:bg-amber-500">
          <Glasses className="size-3.5 shrink-0" />
          <span className="truncate text-xs font-semibold">
            {t.preview.active} · {preview.target.displayName} ·{" "}
            {t.roles[preview.target.role] ?? preview.target.role}
          </span>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 hover:bg-amber-950/10"
            onClick={() => {
              void stop().catch((error) =>
                toast.error(
                  error instanceof Error ? error.message : t.preview.stopFailed
                )
              );
            }}
          >
            {t.preview.exit}
          </button>
        </div>
      )}
      <header className="flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 lg:hidden"
        onClick={onMobileMenu}
        aria-label={t.common.openMenu}
      >
        <Menu className="size-4" />
      </Button>

      <div
        ref={searchRef}
        className="relative w-full max-w-md"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setSearchOpen(false);
          }
        }}
      >
        <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder={t.topbar.searchPlaceholder}
            className="h-8 w-full rounded-md border border-border/70 bg-muted/35 pl-9 pr-3 text-xs text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground hover:border-border hover:bg-muted/55 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && Boolean(suggestKey)}
            aria-controls="global-ticket-suggestions"
          />
        </form>

        {searchOpen && suggestKey && (
          <div
            id="global-ticket-suggestions"
            role="listbox"
            className="absolute top-full z-50 mt-1.5 w-full overflow-hidden rounded-md border border-border/80 bg-popover p-1 shadow-lg shadow-black/8"
          >
            {suggestionsLoading && !suggestions ? (
              <div className="space-y-1 p-1">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : (suggestions?.tickets.length ?? 0) > 0 ? (
              suggestions!.tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  role="option"
                  className="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  onClick={() => {
                    setSearchOpen(false);
                    router.push(`/admin/tickets/${ticket.id}`);
                  }}
                >
                  <Clock3 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ticket.subject}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {ticket.id} · {ticket.customerLabel ?? "—"}
                    </span>
                  </span>
                  <StatusBadge status={ticket.status} className="shrink-0" />
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t.search.noResults}
              </div>
            )}
            <button
              type="button"
              className={cn(
                "mt-1 flex h-8 w-full items-center justify-center gap-2 rounded-sm border-t border-border/60 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                (suggestions?.tickets.length ?? 0) === 0 && "mt-0"
              )}
              onClick={submitSearch}
            >
              <Search className="size-3.5" />
              {t.topbar.viewAllResults}
            </button>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 h-8 gap-2 px-1.5">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">
                  {me ? initials : ""}
                </AvatarFallback>
              </Avatar>
              {me ? (
                <span className="hidden w-[140px] truncate text-sm sm:inline">
                  {me.user.displayName}
                </span>
              ) : (
                <Skeleton className="hidden h-4 w-[140px] sm:inline-block" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <div className="truncate text-sm font-medium">{me?.user.displayName}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">
                {me?.user.email}
              </div>
              {me?.role && (
                <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-normal text-muted-foreground">
                  <span>{t.roles[me.role] ?? me.role}</span>
                  {preview && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 px-1 py-0 text-[10px] text-amber-700 dark:text-amber-400"
                    >
                      {t.preview.badge}
                    </Badge>
                  )}
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canStart && (
              <DropdownMenuItem onClick={() => setPreviewOpen(true)}>
                <Glasses className="size-4" />
                {t.preview.start}
              </DropdownMenuItem>
            )}
            {preview && (
              <DropdownMenuItem
                onClick={() => {
                  void stop().catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : t.preview.stopFailed
                    )
                  );
                }}
              >
                <Glasses className="size-4" />
                {t.preview.exit}
              </DropdownMenuItem>
            )}
            {!preview && (
              <DropdownMenuItem onClick={() => router.push("/admin/account")}>
                <UserRound className="size-4" />
                {t.nav.account}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              onClick={async () => {
                if (preview) {
                  try {
                    await stop({ silent: true });
                  } catch {
                    // Sign-out should still proceed if preview cleanup fails.
                  }
                }
                await signOut();
                router.push("/admin/login");
              }}
            >
              <LogOut className="size-4" />
              {t.common.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PreviewIdentityDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </header>
    </div>
  );
}
