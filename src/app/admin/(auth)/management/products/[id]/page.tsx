"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import type { ProductView } from "@/lib/api/types";
import { useMe } from "@/lib/hooks/use-me";
import type { Permission } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiScopePanel } from "@/components/admin/ai/ai-scope-panel";
import { EmailProductPanel } from "@/components/admin/email/email-product-panel";
import { TicketTypeManagement } from "../../_components/ticket-type-management";
import { TicketTypeRouteManagement } from "../../_components/ticket-type-route-management";
import { TicketTemplateVersionManagement } from "../../_components/ticket-template-version-management";
import { TicketInternalStateManagement } from "../../_components/ticket-internal-state-management";
import { ProductKeyManagement } from "../../_components/product-key-management";
import { TeamManagement } from "../../_components/team-management";
import { AgentManagement } from "../../_components/agent-management";
import { NotificationProductPanel } from "@/components/admin/notifications/notification-product-panel";

type ProductTab =
  | "types"
  | "routing"
  | "forms"
  | "states"
  | "email"
  | "notifications"
  | "teams"
  | "agents"
  | "apiKeys"
  | "knowledge";

const PRODUCT_TABS: Array<{
  value: ProductTab;
  permission: Permission;
  label: (t: ReturnType<typeof useI18n>["t"]) => string;
}> = [
  { value: "types", permission: "ticket_type.write", label: (t) => t.management.tabs.ticketTypes },
  { value: "routing", permission: "ticket_type.route", label: (t) => t.management.tabs.ticketTypeRoutes },
  { value: "forms", permission: "ticket_template.read", label: (t) => t.management.tabs.templates },
  { value: "states", permission: "ticket_type.write", label: (t) => t.management.tabs.internalStates },
  { value: "email", permission: "email.config", label: (t) => t.management.tabs.email },
  { value: "notifications", permission: "notification.manage", label: (t) => t.management.tabs.notifications },
  { value: "teams", permission: "team.manage", label: (t) => t.management.tabs.teams },
  { value: "agents", permission: "team.manage", label: (t) => t.management.tabs.agents },
  { value: "apiKeys", permission: "product.settings", label: (t) => t.management.tabs.apiKeys },
  { value: "knowledge", permission: "ai.knowledge", label: (t) => t.nav.ai },
];

function ProductConfigurationTabs({
  productId,
  tenantId,
}: {
  productId: string;
  tenantId: string;
}) {
  const { t } = useI18n();
  const { can } = useMe();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [emailDirty, setEmailDirty] = useState(false);
  const tabs = PRODUCT_TABS.filter((tab) => can(tab.permission));
  const tabParam = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.value === tabParam)
    ? (tabParam as ProductTab)
    : tabs[0]?.value;

  const canLeaveEmail = () =>
    !emailDirty || window.confirm(t.emailConfig.discardConfirm);

  const handleTabChange = (value: string) => {
    if (activeTab === "email" && value !== "email" && !canLeaveEmail()) return;
    setEmailDirty(false);
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
      <TabsContent value="types" className="mt-4">
        <TicketTypeManagement productId={productId} />
      </TabsContent>
      <TabsContent value="routing" className="mt-4">
        <TicketTypeRouteManagement productId={productId} />
      </TabsContent>
      <TabsContent value="forms" className="mt-4">
        <TicketTemplateVersionManagement productId={productId} />
      </TabsContent>
      <TabsContent value="states" className="mt-4">
        <TicketInternalStateManagement productId={productId} />
      </TabsContent>
      <TabsContent value="email" className="mt-4">
        <EmailProductPanel productId={productId} onDirtyChange={setEmailDirty} />
      </TabsContent>
      <TabsContent value="notifications" className="mt-4">
        <NotificationProductPanel productId={productId} />
      </TabsContent>
      <TabsContent value="teams" className="mt-4">
        <TeamManagement scope="product" tenantId={tenantId} productId={productId} />
      </TabsContent>
      <TabsContent value="agents" className="mt-4">
        <AgentManagement scope="product" tenantId={tenantId} productId={productId} />
      </TabsContent>
      <TabsContent value="apiKeys" className="mt-4">
        <ProductKeyManagement productId={productId} />
      </TabsContent>
      <TabsContent value="knowledge" className="mt-4">
        <AiScopePanel
          scope="product"
          tenantId={tenantId}
          productId={productId}
          includeKnowledge
        />
      </TabsContent>
    </Tabs>
  );
}

export default function ProductConfigurationPage() {
  const { t } = useI18n();
  const { me, isLoading: meLoading } = useMe();
  const { id } = useParams<{ id: string }>();
  const { data: products, isLoading } = useSWR<ProductView[]>(
    "/api/tob/admin/products",
    swrFetcher
  );
  const product = products?.find((item) => item.id === id);

  if (isLoading || meLoading) return <Skeleton className="h-80 w-full" />;
  if (!product) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  const showBack =
    me?.role === "super_admin" ||
    me?.role === "tenant_admin" ||
    (me?.role === "product_admin" && (me.productIds?.length ?? 0) > 1);
  const backHref =
    me?.role === "tenant_admin" && me.user.tenantId
      ? `/admin/management/tenants/${me.user.tenantId}?tab=products`
      : "/admin/management?tab=products";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {showBack && (
          <Button variant="ghost" size="icon" asChild aria-label={t.common.back}>
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div>
          <h1 className="text-xl font-semibold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">{t.management.productConfiguration}</p>
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <ProductConfigurationTabs productId={id} tenantId={product.tenantId} />
      </Suspense>
    </div>
  );
}
