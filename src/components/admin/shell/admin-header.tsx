"use client";

import { useRouter } from "next/navigation";
import { Menu, Search, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  tenant_admin: "Tenant Admin",
  product_admin: "Product Admin",
  team_admin: "Team Admin",
  agent: "Agent",
};

export function AdminHeader({ onMobileMenu }: { onMobileMenu: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const { me } = useMe();

  const initials = (me?.user.displayName || me?.user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 lg:hidden"
        onClick={onMobileMenu}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>

      {/* Global search */}
      <button
        type="button"
        onClick={() => router.push("/admin/search")}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-3.5" />
        <span className="truncate text-xs">{t.topbar.searchPlaceholder}</span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 h-8 gap-2 px-1.5">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate text-sm sm:inline">
                {me?.user.displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <div className="truncate text-sm font-medium">{me?.user.displayName}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">
                {me?.user.email}
              </div>
              {me?.role && (
                <div className="pt-0.5 text-[11px] font-normal text-muted-foreground">
                  {ROLE_LABELS[me.role] ?? me.role}
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/admin/account")}>
              <UserRound className="size-4" />
              {t.nav.account}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              onClick={async () => {
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
    </header>
  );
}
