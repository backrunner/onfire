"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Package,
  Ticket,
} from "lucide-react";

interface DashboardStats {
  pending: number;
  escalated: number;
  overdue: number;
  products: number;
}

interface RecentTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/tob/dashboard", {
          credentials: "include",
        });
        const data = (await res.json()) as { ok: boolean; data: { stats: DashboardStats; recentTickets: RecentTicket[] } };
        if (data.ok) {
          setStats(data.data.stats);
          setRecentTickets(data.data.recentTickets || []);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  const statCards = [
    {
      title: t.dashboard.stats.pending,
      value: stats?.pending ?? 0,
      hint: t.dashboard.stats.pendingHint,
      icon: Clock,
      color: "text-amber-500",
    },
    {
      title: t.dashboard.stats.escalated,
      value: stats?.escalated ?? 0,
      hint: t.dashboard.stats.escalatedHint,
      icon: ArrowUpRight,
      color: "text-orange-500",
    },
    {
      title: t.dashboard.stats.overdue,
      value: stats?.overdue ?? 0,
      hint: t.dashboard.stats.overdueHint,
      icon: AlertTriangle,
      color: "text-red-500",
    },
    {
      title: t.dashboard.stats.products,
      value: stats?.products ?? 0,
      hint: t.dashboard.stats.productsHint,
      icon: Package,
      color: "text-blue-500",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>
        <p className="text-muted-foreground">{t.dashboard.subtitle}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.quickActions}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button asChild>
            <Link href="/admin/tickets">{t.dashboard.viewAllTickets}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/tickets?overdue=true">
              {t.dashboard.viewOverdue}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.recentTickets}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.dashboard.noTickets}</p>
              <p className="text-sm">{t.dashboard.noTicketsHint}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.id}`}
                  className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{ticket.subject}</div>
                      <div className="text-sm text-muted-foreground">
                        {ticket.id}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm capitalize">{ticket.status}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
