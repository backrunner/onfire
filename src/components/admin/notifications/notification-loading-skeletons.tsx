import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationPolicySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="rounded-lg py-0">
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-36 max-w-[60%]" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="flex flex-wrap gap-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function NotificationComplianceSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 px-4 py-3">
            <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[65%]" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotificationProductPanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex h-9 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg bg-muted p-[3px]">
          <Skeleton className="h-[27px] w-20" />
          <Skeleton className="h-[27px] w-24" />
          <Skeleton className="h-[27px] w-20" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <NotificationPolicySkeleton />
    </div>
  );
}
