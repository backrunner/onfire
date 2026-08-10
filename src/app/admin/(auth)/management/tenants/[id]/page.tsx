"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketTypePresetManagement } from "../../_components/ticket-type-preset-management";
import { SpamFilterManagement } from "../../_components/spam-filter-management";

interface Tenant { id: string; name: string }

export default function TenantConfigurationPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data: tenants, isLoading } = useSWR<Tenant[]>("/api/tob/admin/tenants", swrFetcher);
  const tenant = tenants?.find((item) => item.id === id);
  if (isLoading) return <Skeleton className="h-80 w-full" />;
  if (!tenant) return <p className="py-12 text-center text-sm text-muted-foreground">{t.management.noPermission}</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label={t.common.back}>
          <Link href="/admin/management?tab=tenants"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div><h1 className="text-xl font-semibold">{tenant.name}</h1><p className="text-sm text-muted-foreground">{t.management.tenantConfiguration}</p></div>
      </div>
      <Tabs defaultValue="presets">
        <TabsList><TabsTrigger value="presets">{t.management.tabs.ticketTypePresets}</TabsTrigger><TabsTrigger value="spam">{t.management.tabs.spamFilter}</TabsTrigger></TabsList>
        <TabsContent value="presets" className="mt-4"><TicketTypePresetManagement tenantId={id} /></TabsContent>
        <TabsContent value="spam" className="mt-4"><SpamFilterManagement tenantId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}
