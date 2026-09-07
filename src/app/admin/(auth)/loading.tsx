import { Skeleton } from "@/components/ui/skeleton";
import { ManagementPanelSkeleton } from "@/components/admin/loading-skeletons";

// Let Next prefetch the authenticated shell and show immediate feedback while
// a child route loads, without blocking the persistent navigation/header.
export default function AdminPageLoading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <ManagementPanelSkeleton />
    </div>
  );
}
