import { AI_TASK_TYPES } from "@/lib/ai-config";
import { TableSkeleton } from "@/components/admin/loading-skeletons";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AiCredentialsSkeleton() {
  return (
    <div
      className="grid items-stretch gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
      aria-hidden="true"
    >
      <Card className="h-full min-h-[320px] gap-0 py-0 lg:min-h-[520px]">
        <CardHeader className="flex items-center justify-between px-4 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-8 w-16" />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-0 pb-0">
          <div className="divide-y border-t">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-[66px] items-center gap-3 px-4 py-3"
              >
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28 max-w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="h-full min-h-[320px] gap-0 py-0 lg:min-h-[520px]">
        <CardHeader className="space-y-2 px-5 py-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Skeleton className="h-8 w-full sm:col-span-2" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full sm:col-span-2" />
          <Skeleton className="h-8 w-full sm:col-span-2" />
          <div className="flex items-center justify-between border-t pt-4 sm:col-span-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskRoutingSkeleton() {
  return (
    <Card className="flex min-h-[360px] flex-col gap-0 rounded-lg py-0">
      <CardHeader className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          </div>
          <Skeleton className="size-5 shrink-0 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div className="flex min-h-40 flex-1 flex-col gap-3 rounded-md border border-dashed px-3 py-3">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="mt-2 h-3 w-32" />
          <Skeleton className="h-3 w-44 max-w-full" />
        </div>
        <div className="mt-auto flex items-center justify-between border-t pt-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AiRoutingSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      {AI_TASK_TYPES.map((taskType) => (
        <TaskRoutingSkeleton key={taskType} />
      ))}
    </div>
  );
}

export function AiUsageSkeleton({
  scope = "system",
}: {
  scope?: "system" | "tenant" | "product";
}) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Card className="gap-0 py-0">
        <CardHeader className="space-y-2 px-5 py-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 px-5 pb-4">
          {scope !== "system" && (
            <div className="flex h-8 items-center gap-2">
              <Skeleton className="h-5 w-9 rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          )}
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-44" />
          </div>
          <Skeleton className="h-8 w-20" />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="space-y-2 px-5 py-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-1 rounded-md border px-3 py-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
          <TableSkeleton
            rows={4}
            columns={4}
            columnWidths={["w-32", "", "w-28", "w-32"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function KnowledgeRowsSkeleton({
  rows,
  documents = false,
}: {
  rows: number;
  documents?: boolean;
}) {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <li
          key={index}
          className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          {documents && <Skeleton className="size-4 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36 max-w-[65%]" />
              {!documents && <Skeleton className="h-4 w-14 rounded" />}
            </div>
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          {documents && <Skeleton className="h-5 w-16 rounded-md" />}
          <Skeleton className="size-8 shrink-0 rounded-md" />
          {!documents && <Skeleton className="size-8 shrink-0 rounded-md" />}
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeCardSkeleton({
  rows,
  documents = false,
}: {
  rows: number;
  documents?: boolean;
}) {
  return (
    <Card aria-hidden="true">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </CardHeader>
      <CardContent>
        <KnowledgeRowsSkeleton rows={rows} documents={documents} />
      </CardContent>
    </Card>
  );
}

export function AiKnowledgeSkeleton({
  showProductSelect = false,
}: {
  showProductSelect?: boolean;
}) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-72 max-w-full" />
        {showProductSelect && <Skeleton className="h-8 w-56" />}
      </div>
      <KnowledgeCardSkeleton rows={3} />
      <KnowledgeCardSkeleton rows={2} documents />
    </div>
  );
}

export function AiScopePanelSkeleton({
  includeKnowledge = false,
}: {
  includeKnowledge?: boolean;
}) {
  const tabs = includeKnowledge ? 4 : 3;
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex h-9 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg bg-muted p-[3px]">
        {Array.from({ length: tabs }).map((_, index) => (
          <Skeleton
            key={index}
            className={index === 0 ? "h-[27px] w-24" : "h-[27px] w-20"}
          />
        ))}
      </div>
      <AiCredentialsSkeleton />
    </div>
  );
}
