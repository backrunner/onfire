"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Package,
  Ticket as TicketIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { Role } from "@/lib/types";
import { swrFetcher } from "@/lib/api/client";
import type { DashboardResponse } from "@/lib/api/types";
import type { Translations } from "@/locales/zh";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/admin/loading-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/admin/status-badges";

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const { me } = useMe();
  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>(
    "/api/tob/dashboard",
    swrFetcher
  );

  const stats = data?.stats;

  // Product count is only meaningful to roles that manage products; team-scoped
  // agents see their handled-ticket count instead (same scoped data source).
  const productViewRole =
    me?.role === Role.SuperAdmin ||
    me?.role === Role.TenantAdmin ||
    me?.role === Role.ProductAdmin;

  const fourthCard = productViewRole
    ? {
        key: "products",
        title: t.dashboard.stats.products,
        hint: t.dashboard.stats.productsHint,
        value: stats?.products ?? 0,
        icon: Package,
        iconClass: "text-sky-600 dark:text-sky-400",
        iconBg: "bg-sky-500/10",
        href: "/admin/management",
      }
    : {
        key: "handled",
        title: t.dashboard.stats.handled,
        hint: t.dashboard.stats.handledHint,
        value: stats?.handled ?? 0,
        icon: TicketIcon,
        iconClass: "text-emerald-600 dark:text-emerald-400",
        iconBg: "bg-emerald-500/10",
        href: "/admin/tickets?status=replied",
      };

  const statCards = [
    {
      key: "pending",
      title: t.dashboard.stats.pending,
      hint: t.dashboard.stats.pendingHint,
      value: stats?.pending ?? 0,
      icon: Clock,
      iconClass: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-500/10",
      href: "/admin/tickets?status=new",
    },
    {
      key: "escalated",
      title: t.dashboard.stats.escalated,
      hint: t.dashboard.stats.escalatedHint,
      value: stats?.escalated ?? 0,
      icon: ArrowUpRight,
      iconClass: "text-orange-600 dark:text-orange-400",
      iconBg: "bg-orange-500/10",
      href: "/admin/tickets?status=escalated",
    },
    {
      key: "overdue",
      title: t.dashboard.stats.overdue,
      hint: t.dashboard.stats.overdueHint,
      value: stats?.overdue ?? 0,
      icon: AlertTriangle,
      iconClass: "text-red-600 dark:text-red-400",
      iconBg: "bg-red-500/10",
      href: "/admin/tickets?overdue=true",
    },
    fourthCard,
  ];

  if (error) {
    return (
      <div className="flex w-full flex-col gap-4 text-left">
        <PageHeading t={t} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
            <p className="text-sm text-muted-foreground">
              {t.dashboard.loadFailed}
            </p>
            <Button size="sm" variant="outline" onClick={() => mutate()}>
              {t.dashboard.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <PageHeading t={t} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-full gap-0 py-0" aria-hidden="true">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="size-7 rounded-md sm:size-8" />
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-3 w-28 max-w-full" />
                </CardContent>
              </Card>
            ))
          : statCards.map((stat) => (
              <Link key={stat.key} href={stat.href} className="group min-w-0">
                <Card className="h-full gap-0 py-0 transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
                    <CardTitle className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                      {stat.title}
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md sm:size-8",
                        stat.iconBg
                      )}
                    >
                      <stat.icon className={cn("size-4", stat.iconClass)} />
                    </span>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className="text-xl font-semibold tabular-nums sm:text-2xl">
                      {stat.value}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                      {stat.hint}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      {!isLoading && (stats?.overdue ?? 0) > 0 && (
        <div className="flex min-h-[66px] flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 sm:min-h-[58px]">
          <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="flex-1 text-sm text-red-700 dark:text-red-400">
            {t.dashboard.slaAlert.replace(
              "{{count}}",
              String(stats?.overdue ?? 0)
            )}
          </p>
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href="/admin/tickets?overdue=true">
              {t.dashboard.slaAlertCta}
            </Link>
          </Button>
        </div>
      )}

      {/* Recent tickets */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3">
          <CardTitle className="text-base">
            {t.dashboard.recentTickets}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href="/admin/tickets">{t.dashboard.viewAllTickets}</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <TableSkeleton
              rows={5}
              columns={4}
              rowClassName="h-10"
              columnWidths={["", "w-28", "w-24", "w-28"]}
            />
          ) : !data || data.recentTickets.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <TicketIcon className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{t.dashboard.noTickets}</p>
              <p className="text-xs text-muted-foreground">
                {t.dashboard.noTicketsHint}
              </p>
            </div>
          ) : (
            <>
            <div className="divide-y sm:hidden">
              {data.recentTickets.map((ticket) => (
                <Link key={ticket.id} href={`/admin/tickets?ticket=${ticket.id}`} className="block space-y-2 py-3 first:pt-0 last:pb-0">
                  <p className="truncate text-sm font-medium">{ticket.subject}</p>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2"><StatusBadge status={ticket.status} /><PriorityBadge priority={ticket.priority} /></span>
                    <span className="shrink-0">{formatDateTime(ticket.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="-mx-2 hidden overflow-x-auto px-2 sm:mx-0 sm:block sm:px-0">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.table.subject}</TableHead>
                  <TableHead className="w-28">
                    {t.dashboard.table.status}
                  </TableHead>
                  <TableHead className="w-24">
                    {t.dashboard.table.priority}
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    {t.dashboard.table.created}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="max-w-0 truncate text-sm">
                      <Link
                        href={`/admin/tickets?ticket=${ticket.id}`}
                        className="hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={ticket.priority} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(ticket.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeading({ t }: { t: Translations }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">
        {t.dashboard.title}
      </h1>
      <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
    </div>
  );
}
