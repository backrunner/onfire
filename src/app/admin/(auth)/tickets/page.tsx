"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { Search, Filter, Ticket as TicketIcon } from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  sla?: {
    acceptBreached: boolean;
    replyBreached: boolean;
  };
}

export default function AdminTicketsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchTickets() {
      try {
        const params = new URLSearchParams();
        const status = searchParams.get("status");
        const priority = searchParams.get("priority");
        const overdue = searchParams.get("overdue");

        if (status) params.set("status", status);
        if (priority) params.set("priority", priority);
        if (overdue) params.set("overdue", overdue);

        const res = await fetch(`/api/tob/tickets?${params.toString()}`, {
          credentials: "include",
        });
        const data = (await res.json()) as { ok: boolean; data: { data: Ticket[] } };
        if (data.ok) {
          setTickets(data.data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch tickets:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTickets();
  }, [searchParams]);

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customerEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.New:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case TicketStatus.Processing:
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case TicketStatus.Replied:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case TicketStatus.Escalated:
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case TicketStatus.Closed:
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
      default:
        return "bg-zinc-100 text-zinc-800";
    }
  };

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case TicketPriority.High:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case TicketPriority.Medium:
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      case TicketPriority.Low:
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-zinc-100 text-zinc-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.tickets.title}</h1>
        <p className="text-muted-foreground">{t.tickets.subtitle}</p>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.topbar.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          {t.common.search}
        </Button>
      </div>

      {/* Ticket List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t.tickets.list.total.replace("{{count}}", String(filteredTickets.length))}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TicketIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.tickets.list.noTickets}</p>
              <p className="text-sm">{t.tickets.list.noTicketsHint}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.id}`}
                  className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(ticket.status)}`}
                        >
                          {t.tickets.status[ticket.status]}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}
                        >
                          {t.tickets.priority[ticket.priority]}
                        </span>
                        {(ticket.sla?.acceptBreached ||
                          ticket.sla?.replyBreached) && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            {t.tickets.detail.slaBreached}
                          </span>
                        )}
                      </div>
                      <div className="font-medium truncate">{ticket.subject}</div>
                      <div className="text-sm text-muted-foreground">
                        {ticket.customerEmail} · {ticket.id}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{new Date(ticket.createdAt).toLocaleDateString()}</div>
                      <div>{new Date(ticket.createdAt).toLocaleTimeString()}</div>
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
