"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ArrowLeft, Send } from "lucide-react";

interface TicketDetail {
  id: string;
  subject: string;
  content: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  assigneeId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  sla?: {
    acceptDeadline?: string;
    replyDeadline?: string;
    acceptBreached: boolean;
    replyBreached: boolean;
  };
}

interface Reply {
  id: string;
  content: string;
  senderId?: string;
  senderEmail?: string;
  internal?: boolean;
  createdAt: string;
}

interface TimelineEntry {
  type: "history" | "reply";
  id: string;
  createdAt: string;
  action?: string;
  content?: string;
  snapshot?: Record<string, unknown>;
}

export default function TicketDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchTicket() {
      try {
        const res = await fetch(`/api/tob/tickets/${ticketId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setTicket(data.data.ticket);
          setTimeline(data.data.timeline || []);
        }
      } catch (error) {
        console.error("Failed to fetch ticket:", error);
      } finally {
        setLoading(false);
      }
    }
    if (ticketId) {
      fetchTicket();
    }
  }, [ticketId]);

  const handleReply = async () => {
    if (!replyContent.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: replyContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setReplyContent("");
        // Refresh ticket data
        const refreshRes = await fetch(`/api/tob/tickets/${ticketId}`, {
          credentials: "include",
        });
        const refreshData = await refreshRes.json();
        if (refreshData.ok) {
          setTicket(refreshData.data.ticket);
          setTimeline(refreshData.data.timeline || []);
        }
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t.errors.notFound}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t.common.back}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">{ticket.id}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Content */}
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.detail.content}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{ticket.content}</p>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.detail.timeline}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-lg ${
                      entry.type === "reply"
                        ? "bg-accent"
                        : "bg-muted/50 border-l-2 border-muted-foreground/20"
                    }`}
                  >
                    {entry.type === "reply" ? (
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {new Date(entry.createdAt).toLocaleString()}
                        </div>
                        <p className="whitespace-pre-wrap">{entry.content}</p>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <span className="font-medium">
                          {t.tickets.historyActions[
                            entry.action as keyof typeof t.tickets.historyActions
                          ] || entry.action}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reply Form */}
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.actions.reply}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <textarea
                  className="w-full min-h-[120px] p-3 rounded-md border bg-background resize-none"
                  placeholder={t.tickets.actions.replyPlaceholder}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                />
                <Button
                  onClick={handleReply}
                  disabled={submitting || !replyContent.trim()}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t.tickets.actions.sendReply}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.detail.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">
                  {t.tickets.detail.ticketId}
                </Label>
                <p className="font-mono text-sm">{ticket.id}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t.common.status}
                </Label>
                <p className="capitalize">{t.tickets.status[ticket.status]}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t.common.priority}
                </Label>
                <p className="capitalize">
                  {t.tickets.priority[ticket.priority]}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t.tickets.detail.customer}
                </Label>
                <p>{ticket.customerEmail}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t.tickets.detail.createdAt}
                </Label>
                <p>{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  {t.tickets.detail.updatedAt}
                </Label>
                <p>{new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
              {ticket.sla && (
                <div>
                  <Label className="text-muted-foreground">
                    {t.tickets.detail.sla}
                  </Label>
                  <div className="text-sm">
                    {(ticket.sla.acceptBreached || ticket.sla.replyBreached) && (
                      <span className="text-destructive font-medium">
                        {t.tickets.detail.slaBreached}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
