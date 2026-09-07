"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
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
import {
  ConfigurationPageSkeleton,
  ManagementPanelSkeleton,
  TabsPanelSkeleton,
} from "@/components/admin/loading-skeletons";
import { AiScopePanelSkeleton } from "@/components/admin/ai/ai-loading-skeletons";
import { EmailProductPanelSkeleton } from "@/components/admin/email/email-loading-skeletons";
import { NotificationProductPanelSkeleton } from "@/components/admin/notifications/notification-loading-skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDiscardDialog } from "@/components/admin/confirm-discard-dialog";

// Tab panels load lazily so dev compilation and initial render only cover the
// active tab instead of the whole product configuration module graph (which
// includes the email, notification, and AI chains).
const AiScopePanel = dynamic(
  () => import("@/components/admin/ai/ai-scope-panel").then((m) => m.AiScopePanel),
  { loading: () => <AiScopePanelSkeleton includeKnowledge /> }
);
const EmailProductPanel = dynamic(
  () =>
    import("@/components/admin/email/email-product-panel").then(
      (m) => m.EmailProductPanel
    ),
  { loading: () => <EmailProductPanelSkeleton /> }
);
const NotificationProductPanel = dynamic(
  () =>
    import("@/components/admin/notifications/notification-product-panel").then(
      (m) => m.NotificationProductPanel
    ),
  { loading: () => <NotificationProductPanelSkeleton /> }
);
const TicketTypeManagement = dynamic(
  () =>
    import("../../_components/ticket-type-management").then(
      (m) => m.TicketTypeManagement
    ),
  { loading: () => <ManagementPanelSkeleton columns={4} /> }
);
const TicketTypeRouteManagement = dynamic(
  () =>
    import("../../_components/ticket-type-route-management").then(
      (m) => m.TicketTypeRouteManagement
    ),
  { loading: () => <ManagementPanelSkeleton columns={4} /> }
);
const TicketInternalStateManagement = dynamic(
  () =>
    import("../../_components/ticket-internal-state-management").then(
      (m) => m.TicketInternalStateManagement
    ),
  {
    loading: () => (
      <ManagementPanelSkeleton
        columns={5}
        controls={1}
        columnWidths={["", "", "hidden md:table-cell", "hidden md:table-cell", "w-12"]}
      />
    ),
  }
);
const ProductKeyManagement = dynamic(
  () =>
    import("../../_components/product-key-management").then(
      (m) => m.ProductKeyManagement
    ),
  { loading: () => <ManagementPanelSkeleton columns={5} /> }
);
const TeamManagement = dynamic(
  () => import("../../_components/team-management").then((m) => m.TeamManagement),
  { loading: () => <ManagementPanelSkeleton columns={4} /> }
);
const AgentManagement = dynamic(
  () => import("../../_components/agent-management").then((m) => m.AgentManagement),
  { loading: () => <ManagementPanelSkeleton columns={5} /> }
);

type ProductTab =
  | "types"
  | "routing"
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
  { value: "types", permission: "ticket_type.write", label: (t) => t.management.tabs.ticketManagement },
  { value: "routing", permission: "ticket_type.route", label: (t) => t.management.tabs.ticketTypeRoutes },
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
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const tabs = PRODUCT_TABS.filter((tab) => can(tab.permission));
  const tabParam = searchParams.get("tab");
  // Legacy deep links to the removed forms tab land on the merged types tab.
  const mappedParam = tabParam === "forms" ? "types" : tabParam;
  const activeTab = tabs.some((tab) => tab.value === mappedParam)
    ? (mappedParam as ProductTab)
    : tabs[0]?.value;

  const applyTab = (value: string) => {
    setEmailDirty(false);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  const handleTabChange = (value: string) => {
    if (activeTab === "email" && value !== "email" && emailDirty) {
      setPendingTab(value);
      return;
    }
    applyTab(value);
  };

  if (tabs.length === 0 || !activeTab) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  return (
    <>
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

      {/* Discard-confirmation for leaving the email tab with unsaved changes */}
      <ConfirmDiscardDialog
        open={pendingTab !== null}
        onOpenChange={(open) => { if (!open) setPendingTab(null); }}
        onConfirm={() => {
          const target = pendingTab;
          setPendingTab(null);
          if (target) applyTab(target);
        }}
        description={t.emailConfig.discardConfirm}
      />
    </>
  );
}

export default function ProductConfigurationPage() {
  const { t } = useI18n();
  const { me, isLoading: meLoading } = useMe();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useSWR<ProductView>(
    `/api/tob/admin/products/${encodeURIComponent(id)}`,
    swrFetcher
  );

  if (isLoading || meLoading) return <ConfigurationPageSkeleton tabs={9} />;
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
      <Suspense fallback={<TabsPanelSkeleton tabs={9} />}>
        <ProductConfigurationTabs productId={id} tenantId={product.tenantId} />
      </Suspense>
    </div>
  );
}
