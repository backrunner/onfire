"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { swrFetcher } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import { Role } from "@/lib/types";
import { NotificationScopePanel } from "@/components/admin/notifications/notification-product-panel";
import type { NotificationComplianceView } from "@/components/admin/notifications/channel-meta";
import { NotificationProductPanelSkeleton } from "@/components/admin/notifications/notification-loading-skeletons";
import { Button } from "@/components/ui/button";

export default function TeamNotificationPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { me, can, isLoading } = useMe();
  const state = useSWR<NotificationComplianceView>(can("notification.manage") ? `/api/tob/admin/notification-compliance?scope=team&teamId=${encodeURIComponent(id)}` : null, swrFetcher);
  if (isLoading || state.isLoading) return <NotificationProductPanelSkeleton />;
  if (can("notification.manage") && state.error) return <div className="space-y-3 py-12 text-center">
    <p className="text-sm text-muted-foreground">{t.notifChannels.loadFailed}</p>
    <Button variant="outline" onClick={() => void state.mutate()}>{t.notifChannels.retry}</Button>
  </div>;
  if (!can("notification.manage") || !state.data) return <p className="py-12 text-center text-sm text-muted-foreground">{t.management.noPermission}</p>;
  const tenant = state.data.chain.find(owner => owner.scope === "tenant");
  const backHref = me?.role === Role.TeamAdmin
    ? me.teamIds.length > 1 ? "/admin/notifications" : "/admin/tickets"
    : me?.role === Role.ProductAdmin
      ? me.productIds.length === 1 ? `/admin/management/products/${encodeURIComponent(me.productIds[0])}?tab=teams` : "/admin/management?tab=products"
      : tenant ? `/admin/management/tenants/${encodeURIComponent(tenant.tenantId)}?tab=teams` : "/admin/management";
  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" asChild aria-label={t.common.back}><Link href={backHref}><ArrowLeft className="size-4" /></Link></Button>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{t.nav.notifications}</h1>
        <p className="mt-1 truncate text-sm text-muted-foreground">{state.data.name}</p>
      </div>
    </div>
    <NotificationScopePanel key={id} owner={{ scope: "team", teamId: id }} />
  </div>;
}
