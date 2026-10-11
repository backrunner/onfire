"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { swrFetcher } from "@/lib/api/client";
import { Role } from "@/lib/types";
import { managementEntryHref } from "@/lib/staff-access";
import { Button } from "@/components/ui/button";
import { NotificationProductPanelSkeleton } from "@/components/admin/notifications/notification-loading-skeletons";

export default function NotificationsPage() {
  const { t } = useI18n();
  const { me, isLoading } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const teamIds = me?.teamIds ?? [];
  const { data: teams, error } = useSWR<Array<{ id: string; name: string; scope: string }>>(me?.role === Role.TeamAdmin ? "/api/tob/meta/teams" : null, swrFetcher);
  const availableTeams = teams?.filter(team => teamIds.includes(team.id) && team.scope !== "system") ?? [];
  useEffect(() => {
    if (!me) return;
    if (me.role === Role.TeamAdmin) {
      if (availableTeams.length === 1) router.replace(`/admin/management/teams/${encodeURIComponent(availableTeams[0].id)}`);
      return;
    }
    const productId = params.get("productId");
    const base = productId ? `/admin/management/products/${encodeURIComponent(productId)}` : managementEntryHref(me);
    if (base) router.replace(`${base}${base.includes("?") ? "&" : "?"}tab=${base === "/admin/management" ? "products" : "notifications"}`);
  }, [me, params, router, availableTeams.length, availableTeams[0]?.id]);
  if (isLoading || !me || (me.role === Role.TeamAdmin && !teams && !error)) return <NotificationProductPanelSkeleton />;
  if (me.role !== Role.TeamAdmin) return <p className="text-sm text-muted-foreground">{t.management.noPermission}</p>;
  return <div className="space-y-4">
    <h1 className="text-xl font-semibold">{t.nav.notifications}</h1>
    {error ? <p className="text-sm text-destructive">{t.notifChannels.loadFailed}</p> : availableTeams.map(team => <Button key={team.id} variant="outline" asChild><Link href={`/admin/management/teams/${encodeURIComponent(team.id)}`}>{team.name}</Link></Button>)}
    {!error && teams && availableTeams.length === 0 && <p className="text-sm text-muted-foreground">{t.notifChannels.noTeams}</p>}
  </div>;
}
