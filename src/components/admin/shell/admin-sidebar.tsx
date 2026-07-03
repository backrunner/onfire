"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  Mail,
  Bell,
  Sparkles,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import type { Permission } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: "dashboard" | "tickets" | "customers" | "admin" | "email" | "notifications" | "ai";
  permission?: Permission;
  exact?: boolean;
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
      { href: "/admin/management", icon: Settings, labelKey: "admin", permission: "team.manage" },
      { href: "/admin/email", icon: Mail, labelKey: "email", permission: "email.config" },
      { href: "/admin/notifications", icon: Bell, labelKey: "notifications", permission: "notification.manage" },
      { href: "/admin/ai", icon: Sparkles, labelKey: "ai", permission: "tenant.manage" },
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
  const { t } = useI18n();
  const { can, isLoading } = useMe();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || isLoading || can(item.permission)
    ),
  })).filter((group) => group.items.length > 0);

  const nav = (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-border/60 px-4",
            collapsed && "justify-center px-0"
          )}
        >
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Flame className="size-4" />
            </span>
            {!collapsed && <span className="text-sm tracking-tight">OnFire</span>}
          </Link>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {visibleGroups.map((group) => (
            <div key={group.labelKey}>
              {!collapsed && (
                <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
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
                      onClick={onMobileClose}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        collapsed && "justify-center px-0 py-2",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {!collapsed && <span>{t.nav[item.labelKey]}</span>}
                    </Link>
                  );
                  return collapsed ? (
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
            className={cn("w-full justify-start gap-2 text-muted-foreground", collapsed && "justify-center")}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
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
          "hidden shrink-0 border-r border-border/60 bg-card transition-[width] duration-200 lg:block",
          collapsed ? "w-14" : "w-60"
        )}
      >
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border/60 bg-card shadow-xl">
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
