"use client";

import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { canAccessManagement } from "@/lib/staff-access";
import { Skeleton } from "@/components/ui/skeleton";

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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full" />
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
