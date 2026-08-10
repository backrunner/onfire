"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import type { Permission } from "@/lib/types";
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

type TabKey =
  | "tenants"
  | "products"
  | "teams"
  | "ticketTypePresets"
  | "users"
  | "agents"
  | "spamFilter"
  | "aiCredentials"
  | "aiRouting";

interface TabDef {
  value: TabKey;
  permission: Permission;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  { value: "tenants", permission: "tenant.manage", render: () => <TenantManagement /> },
  { value: "products", permission: "product.settings", render: () => <ProductManagement /> },
  { value: "teams", permission: "team.manage", render: () => <TeamManagement /> },
  {
    value: "ticketTypePresets",
    permission: "ticket_type.preset.read",
    render: () => <TicketTypePresetManagement />,
  },
  { value: "users", permission: "user.manage", render: () => <UserManagement /> },
  { value: "agents", permission: "user.manage", render: () => <AgentManagement /> },
  {
    value: "spamFilter",
    permission: "spam.config",
    render: () => <SpamFilterManagement />,
  },
  { value: "aiCredentials", permission: "ai.config", render: () => <CredentialsTab /> },
  { value: "aiRouting", permission: "ai.config", render: () => <RoutingTab /> },
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
  const { can, isLoading } = useMe();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleTabs = TABS.filter((tab) => can(tab.permission));

  if (isLoading) {
    return <ManagementPageSkeleton />;
  }

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
      <TabsList className="w-full max-w-full justify-start overflow-x-auto">
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex-none shrink-0">
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t.management.title}</h1>
        <p className="text-sm text-muted-foreground">{t.management.subtitle}</p>
      </div>

      {/* useSearchParams requires a Suspense boundary in the App Router. */}
      <Suspense fallback={<ManagementPageSkeleton />}>
        <ManagementTabs />
      </Suspense>
    </div>
  );
}
