"use client";

import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CredentialsTab } from "./credentials-tab";
import { RoutingTab } from "./routing-tab";
import { UsageTab } from "./usage-tab";
import { KnowledgeTab } from "./knowledge-tab";

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
