"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import type { ProductView } from "@/lib/api/types";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeTab } from "@/components/admin/ai/knowledge-tab";
import { TicketTypeManagement } from "../../_components/ticket-type-management";
import { TicketTypeRouteManagement } from "../../_components/ticket-type-route-management";
import { TicketTemplateVersionManagement } from "../../_components/ticket-template-version-management";
import { TicketInternalStateManagement } from "../../_components/ticket-internal-state-management";
import { ProductKeyManagement } from "../../_components/product-key-management";

export default function ProductConfigurationPage() {
  const { t } = useI18n();
  const { can, isLoading: meLoading } = useMe();
  const { id } = useParams<{ id: string }>();
  const { data: products, isLoading } = useSWR<ProductView[]>("/api/tob/admin/products", swrFetcher);
  const product = products?.find((item) => item.id === id);
  const tabs = [
    can("ticket_type.write") && ["types", t.management.tabs.ticketTypes],
    can("ticket_type.route") && ["routing", t.management.tabs.ticketTypeRoutes],
    can("ticket_template.read") && ["forms", t.management.tabs.templates],
    can("ticket_type.write") && ["states", t.management.tabs.internalStates],
    can("product.settings") && ["apiKeys", t.management.tabs.apiKeys],
    can("ai.knowledge") && ["knowledge", t.nav.ai],
  ].filter(Boolean) as [string, string][];

  if (isLoading || meLoading) return <Skeleton className="h-80 w-full" />;
  if (!product || tabs.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">{t.management.noPermission}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t.common.back}>
          <Link href="/admin/management?tab=products"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">{t.management.productConfiguration}</p>
        </div>
      </div>
      <Tabs defaultValue={tabs[0][0]}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {tabs.map(([value, label]) => <TabsTrigger key={value} value={value} className="shrink-0">{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="types" className="mt-4"><TicketTypeManagement productId={id} /></TabsContent>
        <TabsContent value="routing" className="mt-4"><TicketTypeRouteManagement productId={id} /></TabsContent>
        <TabsContent value="forms" className="mt-4"><TicketTemplateVersionManagement productId={id} /></TabsContent>
        <TabsContent value="states" className="mt-4"><TicketInternalStateManagement productId={id} /></TabsContent>
        <TabsContent value="apiKeys" className="mt-4"><ProductKeyManagement productId={id} /></TabsContent>
        <TabsContent value="knowledge" className="mt-4"><KnowledgeTab productId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}
