"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import { Role } from "@/lib/types";
import type { Permission } from "@/lib/types";
import { useMe } from "@/lib/hooks/use-me";
import { canViewTenantConfiguration } from "@/lib/staff-access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketTypePresetManagement } from "../../_components/ticket-type-preset-management";
import { SpamFilterManagement } from "../../_components/spam-filter-management";
import { ProductManagement } from "../../_components/product-management";
import { UserManagement } from "../../_components/user-management";
import { TeamManagement } from "../../_components/team-management";
import { AgentManagement } from "../../_components/agent-management";
import { AiScopePanel } from "@/components/admin/ai/ai-scope-panel";

interface Tenant {
  id: string;
  name: string;
}

type TenantTab =
  | "products"
  | "users"
  | "teams"
  | "agents"
  | "presets"
  | "spam"
  | "ai";

const TENANT_TABS: Array<{
  value: TenantTab;
  visible: (can: (permission: Permission) => boolean, role?: string) => boolean;
  label: (t: ReturnType<typeof useI18n>["t"]) => string;
}> = [
  { value: "products", visible: (can) => can("product.settings"), label: (t) => t.management.tabs.products },
  { value: "users", visible: (can) => can("user.manage"), label: (t) => t.management.tabs.users },
  { value: "teams", visible: (can) => can("team.manage"), label: (t) => t.management.tabs.teams },
  { value: "agents", visible: (can) => can("team.manage"), label: (t) => t.management.tabs.agents },
  {
    value: "presets",
    visible: (can) => can("ticket_type.preset.read"),
    label: (t) => t.management.tabs.ticketTypePresets,
  },
  { value: "spam", visible: (can) => can("spam.config"), label: (t) => t.management.tabs.spamFilter },
  {
    value: "ai",
    visible: (can, role) => can("ai.config") || role === Role.TenantAdmin,
    label: (t) => t.nav.ai,
  },
];

function TenantConfigurationTabs({ tenantId }: { tenantId: string }) {
  const { t } = useI18n();
  const { me, can } = useMe();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = TENANT_TABS.filter((tab) => tab.visible(can, me?.role));
  const tabParam = searchParams.get("tab");
  const mappedParam =
    tabParam === "ticketTypePresets"
      ? "presets"
      : tabParam === "spamFilter"
        ? "spam"
        : tabParam === "aiCredentials" || tabParam === "aiRouting" || tabParam === "aiUsage"
          ? "ai"
          : tabParam;
  const activeTab = tabs.some((tab) => tab.value === mappedParam)
    ? (mappedParam as TenantTab)
    : tabs[0]?.value;

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  if (tabs.length === 0 || !activeTab) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label(t)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="products" className="mt-4">
        <ProductManagement tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="users" className="mt-4">
        <UserManagement tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="teams" className="mt-4">
        <TeamManagement scope="tenant" tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="agents" className="mt-4">
        <AgentManagement scope="tenant" tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="presets" className="mt-4">
        <TicketTypePresetManagement tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="spam" className="mt-4">
        <SpamFilterManagement tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="ai" className="mt-4">
        <AiScopePanel scope="tenant" tenantId={tenantId} />
      </TabsContent>
    </Tabs>
  );
}

export default function TenantConfigurationPage() {
  const { t } = useI18n();
  const { me, isLoading: meLoading } = useMe();
  const { id } = useParams<{ id: string }>();
  const { data: tenants, isLoading } = useSWR<Tenant[]>(
    "/api/tob/admin/tenants",
    swrFetcher
  );
  const tenant = tenants?.find((item) => item.id === id);
  const allowed = me ? canViewTenantConfiguration(me, id) : false;

  if (isLoading || meLoading) return <Skeleton className="h-80 w-full" />;
  if (!tenant || !allowed) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  const showBack = me?.role === Role.SuperAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {showBack && (
          <Button variant="ghost" size="icon" asChild aria-label={t.common.back}>
            <Link href="/admin/management?tab=tenants">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div>
          <h1 className="text-xl font-semibold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t.management.tenantConfiguration}
          </p>
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <TenantConfigurationTabs tenantId={id} />
      </Suspense>
    </div>
  );
}
