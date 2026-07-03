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
import { swrFetcher } from "@/lib/api/client";
import type { DashboardResponse } from "@/lib/api/types";
import type { Translations } from "@/locales/zh";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/admin/status-badges";

function formatRelativeTime(
  time: Translations["dashboard"]["time"],
  iso: string
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return time.justNow;
  if (minutes < 60) return time.minutesAgo.replace("{{n}}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return time.hoursAgo.replace("{{n}}", String(hours));
  return time.daysAgo.replace("{{n}}", String(Math.floor(hours / 24)));
}

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>(
    "/api/tob/dashboard",
    swrFetcher
  );

  const stats = data?.stats;

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
    {
      key: "products",
      title: t.dashboard.stats.products,
      hint: t.dashboard.stats.productsHint,
      value: stats?.products ?? 0,
      icon: Package,
      iconClass: "text-sky-600 dark:text-sky-400",
      iconBg: "bg-sky-500/10",
      href: "/admin/management",
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      <PageHeading t={t} />

      {/* SLA alert banner */}
      {!isLoading && (stats?.overdue ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
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

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          : statCards.map((stat) => (
              <Link key={stat.key} href={stat.href} className="group">
                <Card className="transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md",
                        stat.iconBg
                      )}
                    >
                      <stat.icon className={cn("size-4", stat.iconClass)} />
                    </span>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold tabular-nums">
                      {stat.value}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {stat.hint}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      {/* Recent tickets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {t.dashboard.recentTickets}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href="/admin/tickets">{t.dashboard.viewAllTickets}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !data || data.recentTickets.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <TicketIcon className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">{t.dashboard.noTickets}</p>
              <p className="text-xs text-muted-foreground">
                {t.dashboard.noTicketsHint}
              </p>
            </div>
          ) : (
            <Table>
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
                      {formatRelativeTime(t.dashboard.time, ticket.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeading({ t }: { t: Translations }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        {t.dashboard.title}
      </h1>
      <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
    </div>
  );
}
