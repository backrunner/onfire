"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ArrowLeft, Send, Loader2, Clock, User } from "lucide-react";

interface TicketDetailData {
  id: string;
  subject: string;
  content: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

interface Reply {
  id: string;
  content: string;
  senderEmail?: string;
  senderId?: string;
  createdAt: string;
  internal?: boolean;
}

interface TicketDetailProps {
  ticket: TicketDetailData;
  replies: Reply[];
  token: string;
  onBack?: () => void;
  onReplySuccess?: () => void;
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

export function TicketDetail({
  ticket,
  replies,
  token,
  onBack,
  onReplySuccess,
}: TicketDetailProps) {
  const { t } = useI18n();
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isClosed = ticket.status === TicketStatus.Closed;

  const handleReply = async () => {
    if (!replyContent.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/toc/tickets/${ticket.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: replyContent }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (data.ok) {
        setReplyContent("");
        onReplySuccess?.();
      } else {
        setError(data.error || t.errors.unknownError);
      }
    } catch (err) {
      setError(t.errors.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            #{ticket.id.slice(-8)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={priorityColors[ticket.priority]}>
            {t.tickets.priority[ticket.priority]}
          </Badge>
          <Badge variant={statusColors[ticket.status]}>
            {t.tickets.status[ticket.status]}
          </Badge>
        </div>
      </div>

      {/* Ticket Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t.tickets.detail.content}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap">{ticket.content}</p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">{t.tickets.detail.createdAt}</Label>
              <p>{new Date(ticket.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">{t.tickets.detail.updatedAt}</Label>
              <p>{new Date(ticket.updatedAt).toLocaleString()}</p>
            </div>
          </div>

          {ticket.metadata && Object.keys(ticket.metadata).length > 0 && (
            <>
              <Separator />
              <div>
                <Label className="text-muted-foreground">{t.tickets.detail.metadata}</Label>
                <div className="mt-2 p-3 bg-muted rounded-md text-sm font-mono">
                  {Object.entries(ticket.metadata).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-muted-foreground">{key}:</span>{" "}
                      {String(value)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Replies */}
      <Card>
        <CardHeader>
          <CardTitle>{t.tickets.detail.replies}</CardTitle>
        </CardHeader>
        <CardContent>
          {replies.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {t.tickets.detail.noReplies}
            </p>
          ) : (
            <div className="space-y-4">
              {replies
                .filter((r) => !r.internal)
                .map((reply) => (
                  <div
                    key={reply.id}
                    className={`p-4 rounded-lg ${
                      reply.senderId
                        ? "bg-accent ml-8"
                        : "bg-muted/50 mr-8"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <User className="h-3 w-3" />
                      <span>
                        {reply.senderId
                          ? t.toc.detail?.agentReply || "Support Agent"
                          : ticket.customerEmail}
                      </span>
                      <Clock className="h-3 w-3 ml-2" />
                      <span>{new Date(reply.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{reply.content}</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reply Form */}
      {!isClosed && (
        <Card>
          <CardHeader>
            <CardTitle>{t.tickets.actions.reply}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              className="min-h-[100px]"
              placeholder={t.toc.detail?.replyPlaceholder || "Enter your reply..."}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={handleReply}
              disabled={submitting || !replyContent.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {t.tickets.actions.sendReply}
            </Button>
          </CardContent>
        </Card>
      )}

      {isClosed && (
        <Card>
          <CardContent className="p-4 text-center text-muted-foreground">
            {t.toc.detail?.ticketClosed || "This ticket is closed and no longer accepts replies."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
