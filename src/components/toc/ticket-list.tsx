"use client";

import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ChevronRight, Clock } from "lucide-react";

interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

interface TicketListProps {
  tickets: TicketSummary[];
  loading?: boolean;
  onSelect?: (ticketId: string) => void;
}

const statusColors: Record<TicketStatus, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  [TicketStatus.New]: "warning",
  [TicketStatus.Processing]: "default",
  [TicketStatus.Replied]: "success",
  [TicketStatus.Escalated]: "destructive",
  [TicketStatus.Closed]: "secondary",
};

const priorityColors: Record<TicketPriority, "default" | "secondary" | "destructive" | "outline" | "warning"> = {
  [TicketPriority.High]: "destructive",
  [TicketPriority.Medium]: "warning",
  [TicketPriority.Low]: "secondary",
};

export function TicketList({ tickets, loading, onSelect }: TicketListProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            {t.toc.list?.noTickets || "No tickets found"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t.toc.list?.noTicketsHint || "Submit a ticket to get started"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <Card
          key={ticket.id}
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onSelect?.(ticket.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{ticket.subject}</h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  <span className="font-mono text-xs">#{ticket.id.slice(-8)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={priorityColors[ticket.priority]}>
                  {t.tickets.priority[ticket.priority]}
                </Badge>
                <Badge variant={statusColors[ticket.status]}>
                  {t.tickets.status[ticket.status]}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
