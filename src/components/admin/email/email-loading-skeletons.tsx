import { TableSkeleton } from "@/components/admin/loading-skeletons";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function SettingsCardSkeleton({
  fields,
  footer = false,
}: {
  fields: number;
  footer?: boolean;
}) {
  return (
    <Card
      className="gap-0 overflow-hidden border-border/70 py-0 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]"
      aria-hidden="true"
    >
      <CardHeader className="flex flex-row items-start justify-between px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="hidden h-3 w-16 sm:block" />
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, index) => (
            <FieldSkeleton key={index} />
          ))}
        </div>
        {footer && (
          <>
            <div className="h-px bg-border" />
            <div className="flex min-h-10 items-center gap-3">
              <Skeleton className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="h-8 w-24 shrink-0" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function EmailSettingsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <SettingsCardSkeleton fields={2} footer />
      <SettingsCardSkeleton fields={5} footer />
      <SettingsCardSkeleton fields={1} />
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="my-0.5 h-3 w-28" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Skeleton className="h-10 sm:h-8 sm:w-20" />
          <Skeleton className="h-10 sm:h-8 sm:w-24" />
        </div>
      </div>
    </div>
  );
}

export function EmailTemplatesSkeleton() {
  return (
    <Card className="gap-0 py-0" aria-hidden="true">
      <CardHeader className="space-y-2 px-5 py-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5"
          >
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-4 min-w-20 flex-1" />
            <Skeleton className="h-5 w-14" />
            <Skeleton className="size-8 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EmailLogsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex h-8 w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
        <Skeleton className="h-[22px] w-20" />
        <Skeleton className="h-[22px] w-20" />
      </div>
      <Card className="py-0">
        <CardContent className="py-4">
          <TableSkeleton
            rows={6}
            columns={5}
            rowClassName="h-10"
            columnWidths={["", "", "w-24", "w-36", "w-28"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function EmailProductPanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex h-9 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg bg-muted p-[3px]">
        <Skeleton className="h-[27px] w-20" />
        <Skeleton className="h-[27px] w-24" />
        <Skeleton className="h-[27px] w-16" />
      </div>
      <EmailSettingsSkeleton />
    </div>
  );
}
