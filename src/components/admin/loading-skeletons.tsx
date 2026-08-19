import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  columnWidths?: string[];
  className?: string;
  rowClassName?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
  columnWidths = [],
  className,
  rowClassName,
}: TableSkeletonProps) {
  return (
    <div className={cn("min-w-0", className)} aria-hidden="true">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, column) => (
              <TableHead key={column} className={columnWidths[column]}>
                <Skeleton
                  className={cn(
                    "h-3",
                    column === columns - 1 ? "ml-auto w-8" : "w-16",
                  )}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, row) => (
            <TableRow
              key={row}
              className={cn(rowClassName ?? "h-12", "hover:bg-transparent")}
            >
              {Array.from({ length: columns }).map((__, column) => (
                <TableCell key={column} className={columnWidths[column]}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      column === columns - 1
                        ? "ml-auto w-8"
                        : column === 0
                          ? "w-32 max-w-full"
                          : "w-20 max-w-full",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ManagementPanelSkeletonProps extends TableSkeletonProps {
  toolbar?: boolean;
  controls?: number;
}

export function ManagementPanelSkeleton({
  rows = 5,
  columns = 5,
  columnWidths,
  toolbar = true,
  controls = 0,
}: ManagementPanelSkeletonProps) {
  return (
    <Card
      className="h-full min-h-[340px] gap-0 overflow-hidden py-0"
      aria-hidden="true"
    >
      <CardHeader className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        {toolbar && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-20" />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {controls > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: controls }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        )}
        <TableSkeleton
          rows={rows}
          columns={columns}
          columnWidths={columnWidths}
        />
      </CardContent>
    </Card>
  );
}

export function ManagementFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <Card
      className="h-full min-h-[340px] gap-0 overflow-hidden py-0"
      aria-hidden="true"
    >
      <CardHeader className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-20" />
      </CardHeader>
      <CardContent className="grid max-w-3xl gap-4 px-5 pb-4 sm:grid-cols-2">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TabsPanelSkeleton({
  tabs = 5,
  columns = 5,
  rows = 5,
}: {
  tabs?: number;
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex h-9 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg bg-muted p-[3px]">
        {Array.from({ length: tabs }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-[27px] shrink-0", index % 3 === 0 ? "w-20" : "w-16")}
          />
        ))}
      </div>
      <ManagementPanelSkeleton columns={columns} rows={rows} />
    </div>
  );
}

export function ConfigurationPageSkeleton({
  tabs = 7,
  columns = 5,
  rows = 5,
}: {
  tabs?: number;
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex min-h-10 items-start gap-3">
        <Skeleton className="size-9 shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <TabsPanelSkeleton tabs={tabs} columns={columns} rows={rows} />
    </div>
  );
}
