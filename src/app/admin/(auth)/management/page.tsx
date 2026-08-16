"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { managementEntryHref } from "@/lib/staff-access";
import type { Permission } from "@/lib/types";
import { Role } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantManagement } from "./_components/tenant-management";
import { ProductManagement } from "./_components/product-management";
import { TeamManagement } from "./_components/team-management";
import { UserManagement } from "./_components/user-management";
import { AgentManagement } from "./_components/agent-management";
import { TicketTypePresetManagement } from "./_components/ticket-type-preset-management";
import { SpamFilterManagement } from "./_components/spam-filter-management";
import { CredentialsTab } from "@/components/admin/ai/credentials-tab";
import { RoutingTab } from "@/components/admin/ai/routing-tab";
import { UsageTab } from "@/components/admin/ai/usage-tab";

type TabKey =
  | "tenants"
  | "products"
  | "teams"
  | "ticketTypePresets"
  | "users"
  | "agents"
  | "spamFilter"
  | "aiCredentials"
  | "aiRouting"
  | "aiUsage";

interface TabDef {
  value: TabKey;
  permission: Permission;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  { value: "tenants", permission: "tenant.manage", render: () => <TenantManagement /> },
  { value: "products", permission: "product.settings", render: () => <ProductManagement /> },
  { value: "teams", permission: "team.manage", render: () => <TeamManagement scope="system" /> },
  {
    value: "ticketTypePresets",
    permission: "ticket_type.preset.read",
    render: () => <TicketTypePresetManagement />,
  },
  { value: "users", permission: "user.manage", render: () => <UserManagement /> },
  { value: "agents", permission: "user.manage", render: () => <AgentManagement scope="system" /> },
  {
    value: "spamFilter",
    permission: "spam.config",
    render: () => <SpamFilterManagement />,
  },
  { value: "aiCredentials", permission: "ai.config", render: () => <CredentialsTab /> },
  { value: "aiRouting", permission: "ai.config", render: () => <RoutingTab /> },
  { value: "aiUsage", permission: "ai.config", render: () => <UsageTab /> },
];

function ManagementPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-full max-w-2xl" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ManagementTabs() {
  const { t } = useI18n();
  const { me, can, isLoading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const entryHref = me ? managementEntryHref(me) : null;

  useEffect(() => {
    if (isLoading || !entryHref || entryHref === "/admin/management") return;
    const tab = searchParams.get("tab");
    const productTab =
      tab === "aiCredentials" || tab === "aiRouting" || tab === "aiUsage"
        ? "knowledge"
        : tab;
    const next =
      tab && entryHref.includes("/tenants/")
        ? `${entryHref}?tab=${encodeURIComponent(tab)}`
        : tab && entryHref.includes("/products/")
          ? `${entryHref}?tab=${encodeURIComponent(productTab ?? tab)}`
          : entryHref;
    router.replace(next);
  }, [entryHref, isLoading, router, searchParams]);

  if (isLoading || (entryHref && entryHref !== "/admin/management")) {
    return <ManagementPageSkeleton />;
  }

  const visibleTabs = TABS.filter((tab) => {
    if (me?.role === Role.ProductAdmin) return tab.value === "products";
    if (me?.role !== Role.SuperAdmin) return false;
    return can(tab.permission);
  });

  if (visibleTabs.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  const tabParam = searchParams.get("tab");
  const activeTab = visibleTabs.some((tab) => tab.value === tabParam)
    ? (tabParam as TabKey)
    : visibleTabs[0].value;

  const handleTabChange = (value: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${sp.toString()}`);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {t.management.tabs[tab.value]}
          </TabsTrigger>
        ))}
      </TabsList>

      {visibleTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.render()}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function AdminManagementPage() {
  const { t } = useI18n();
  const { me, isLoading } = useMe();
  const isProductAdmin = me?.role === Role.ProductAdmin;
  const title = isProductAdmin ? t.management.productTitle : t.management.title;
  const subtitle = isProductAdmin
    ? t.management.productSubtitle
    : t.management.subtitle;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {isLoading ? t.management.title : title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? t.management.subtitle : subtitle}
        </p>
      </div>

      {/* useSearchParams requires a Suspense boundary in the App Router. */}
      <Suspense fallback={<ManagementPageSkeleton />}>
        <ManagementTabs />
      </Suspense>
    </div>
  );
}
