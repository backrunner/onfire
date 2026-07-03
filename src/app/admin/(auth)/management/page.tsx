"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import type { Permission } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantManagement } from "./_components/tenant-management";
import { ProductManagement } from "./_components/product-management";
import { TeamManagement } from "./_components/team-management";
import { TemplateManagement } from "./_components/template-management";
import { UserManagement } from "./_components/user-management";
import { AgentManagement } from "./_components/agent-management";
import { CategoryRouteManagement } from "./_components/category-route-management";
import { ProductKeyManagement } from "./_components/product-key-management";

type TabKey =
  | "tenants"
  | "products"
  | "teams"
  | "templates"
  | "users"
  | "agents"
  | "categoryRoutes"
  | "apiKeys";

interface TabDef {
  value: TabKey;
  permission: Permission;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  { value: "tenants", permission: "tenant.manage", render: () => <TenantManagement /> },
  { value: "products", permission: "product.manage", render: () => <ProductManagement /> },
  { value: "teams", permission: "team.manage", render: () => <TeamManagement /> },
  { value: "templates", permission: "template.read", render: () => <TemplateManagement /> },
  { value: "users", permission: "user.manage", render: () => <UserManagement /> },
  { value: "agents", permission: "user.manage", render: () => <AgentManagement /> },
  {
    value: "categoryRoutes",
    permission: "category.map",
    render: () => <CategoryRouteManagement />,
  },
  { value: "apiKeys", permission: "product.manage", render: () => <ProductKeyManagement /> },
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
  const router = useRouter();
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
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="flex-wrap">
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {t.management.tabs[tab.value]}
          </TabsTrigger>
        ))}
      </TabsList>

      {visibleTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-6">
          {tab.render()}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function AdminManagementPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.management.title}</h1>
        <p className="text-muted-foreground">{t.management.subtitle}</p>
      </div>

      {/* useSearchParams requires a Suspense boundary in the App Router. */}
      <Suspense fallback={<ManagementPageSkeleton />}>
        <ManagementTabs />
      </Suspense>
    </div>
  );
}
