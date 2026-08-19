"use client";

import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { canAccessManagement } from "@/lib/staff-access";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsPanelSkeleton } from "@/components/admin/loading-skeletons";

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <TabsPanelSkeleton tabs={10} />
      </div>
    );
  }

  if (!me || !canAccessManagement(me.role)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.management.noPermission}
      </p>
    );
  }

  return children;
}
