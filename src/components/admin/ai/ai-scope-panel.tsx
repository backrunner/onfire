"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Inner tabs load lazily so opening the AI panel only compiles and renders the
// active sub-tab.
const tabFallback = () => <Skeleton className="h-64 w-full" />;
const CredentialsTab = dynamic(
  () => import("./credentials-tab").then((m) => m.CredentialsTab),
  { loading: tabFallback }
);
const RoutingTab = dynamic(
  () => import("./routing-tab").then((m) => m.RoutingTab),
  { loading: tabFallback }
);
const UsageTab = dynamic(
  () => import("./usage-tab").then((m) => m.UsageTab),
  { loading: tabFallback }
);
const KnowledgeTab = dynamic(
  () => import("./knowledge-tab").then((m) => m.KnowledgeTab),
  { loading: tabFallback }
);

export function AiScopePanel({
  scope,
  tenantId,
  productId,
  includeKnowledge = false,
}: {
  scope: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
  includeKnowledge?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Tabs defaultValue="credentials">
      <TabsList>
        <TabsTrigger value="credentials">{t.management.tabs.aiCredentials}</TabsTrigger>
        <TabsTrigger value="routing">{t.management.tabs.aiRouting}</TabsTrigger>
        <TabsTrigger value="usage">{t.management.tabs.aiUsage}</TabsTrigger>
        {includeKnowledge && (
          <TabsTrigger value="knowledge">{t.management.tabs.aiKnowledge}</TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="credentials" className="mt-4">
        <CredentialsTab scope={scope} tenantId={tenantId} productId={productId} />
      </TabsContent>
      <TabsContent value="routing" className="mt-4">
        <RoutingTab scope={scope} tenantId={tenantId} productId={productId} />
      </TabsContent>
      <TabsContent value="usage" className="mt-4">
        <UsageTab scope={scope} tenantId={tenantId} productId={productId} />
      </TabsContent>
      {includeKnowledge && productId && (
        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeTab productId={productId} />
        </TabsContent>
      )}
    </Tabs>
  );
}
