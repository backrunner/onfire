"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import type { Permission } from "@/lib/types";
import { canAccessManagement, managementEntryHref } from "@/lib/staff-access";
import { isAdminNavItemActive } from "./admin-navigation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: "dashboard" | "tickets" | "customers" | "admin";
  permission?: Permission;
  exact?: boolean;
  matchHref?: string;
}

interface NavGroup {
  labelKey: "workspace" | "configuration";
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "workspace",
    items: [
      { href: "/admin", icon: LayoutDashboard, labelKey: "dashboard", exact: true },
      { href: "/admin/tickets", icon: Ticket, labelKey: "tickets", permission: "ticket.read" },
      { href: "/admin/customers", icon: Users, labelKey: "customers", permission: "customer.read" },
    ],
  },
  {
    labelKey: "configuration",
    items: [
      {
        href: "/admin/management",
        icon: Settings,
        labelKey: "admin",
        matchHref: "/admin/management",
      },
    ],
  },
];

interface AdminSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { me, can, isLoading } = useMe();

  const isActive = (item: NavItem) =>
    isAdminNavItemActive(pathname, item.matchHref ?? item.href, item.exact);

  const managementHref = me ? managementEntryHref(me) : null;
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      if (item.href === "/admin/management") {
        if (isLoading || !me || !canAccessManagement(me.role) || !managementHref) {
          return [];
        }
        return [{ ...item, href: managementHref }];
      }
      if (item.permission && !isLoading && !can(item.permission)) return [];
      return [item];
    }),
  })).filter((group) => group.items.length > 0);

  const prefetchKey = visibleGroups
    .flatMap((group) => group.items.map((item) => item.href))
    .join("|");
  useEffect(() => {
    if (!prefetchKey) return;
    for (const href of prefetchKey.split("|")) router.prefetch(href);
  }, [prefetchKey, router]);

  const renderNav = (compact: boolean) => (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-border/60 px-4",
            compact && "justify-center px-0"
          )}
        >
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-sm shadow-orange-500/20"
              )}
            >
              <Flame className="size-4" />
            </span>
            {!compact && <span className="text-sm">OnFire</span>}
          </Link>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {visibleGroups.map((group) => (
            <div key={group.labelKey}>
              {!compact && (
                <div className="mb-1.5 px-2 text-[11px] font-medium uppercase text-muted-foreground/70">
                  {t.nav[group.labelKey]}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item);
                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onClick={onMobileClose}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        compact && "justify-center px-0 py-2",
                        active
                          ? "bg-gradient-to-r from-orange-500/12 via-amber-500/8 to-transparent font-medium text-foreground ring-1 ring-inset ring-orange-500/10"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0",
                          active
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!compact && <span>{t.nav[item.labelKey]}</span>}
                    </Link>
                  );
                  return compact ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{t.nav[item.labelKey]}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden border-t border-border/60 p-2 lg:block">
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-muted-foreground", compact && "justify-center")}
            onClick={onToggleCollapsed}
            aria-label={compact ? t.nav.expand : t.nav.collapse}
          >
            {compact ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span className="text-xs">{t.nav.collapse}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
          collapsed ? "w-14" : "w-60"
        )}
      >
        <div className="sticky top-0 h-screen">{renderNav(collapsed)}</div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <SheetContent
          side="left"
          className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">OnFire</SheetTitle>
          <SheetDescription className="sr-only">
            {t.nav.workspace}
          </SheetDescription>
          {renderNav(false)}
        </SheetContent>
      </Sheet>
    </>
  );
}
