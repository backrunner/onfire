"use client";

import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { CredentialsTab } from "@/components/admin/ai/credentials-tab";
import { RoutingTab } from "@/components/admin/ai/routing-tab";
import { KnowledgeTab } from "@/components/admin/ai/knowledge-tab";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminAiPage() {
  const { t } = useI18n();
  const { can, isLoading } = useMe();
  const canConfigure = can("ai.config");
  const canKnowledge = can("ai.knowledge");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Skeleton className="h-[520px] rounded-lg" />
          <Skeleton className="h-[520px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (!canConfigure && !canKnowledge) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1.5 py-16 text-center">
          <ShieldAlert className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{t.aiConfig.noAccess}</p>
          <p className="text-xs text-muted-foreground">{t.aiConfig.noAccessHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t.aiConfig.title}</h1>
        <p className="text-sm text-muted-foreground">{t.aiConfig.subtitle}</p>
      </div>

      <Tabs defaultValue={canConfigure ? "credentials" : "knowledge"}>
        <TabsList>
          {canConfigure && (
            <>
              <TabsTrigger value="credentials">{t.aiConfig.tabs.credentials}</TabsTrigger>
              <TabsTrigger value="routing">{t.aiConfig.tabs.routing}</TabsTrigger>
            </>
          )}
          {canKnowledge && (
            <TabsTrigger value="knowledge">{t.aiConfig.tabs.knowledge}</TabsTrigger>
          )}
        </TabsList>
        {canConfigure && (
          <>
            <TabsContent value="credentials" className="mt-4">
              <CredentialsTab />
            </TabsContent>
            <TabsContent value="routing" className="mt-4">
              <RoutingTab />
            </TabsContent>
          </>
        )}
        {canKnowledge && (
          <TabsContent value="knowledge" className="mt-4">
            <KnowledgeTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
