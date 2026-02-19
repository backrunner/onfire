"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TicketStatus, TicketPriority } from "@/lib/types";
import {
  ArrowLeft,
  Send,
  MoreVertical,
  UserPlus,
  ArrowUpCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface TicketDetail {
  id: string;
  subject: string;
  content: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerEmail: string;
  assigneeId?: string;
  teamId: string;
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

interface TimelineEntry {
  type: "history" | "reply";
  id: string;
  createdAt: string;
  action?: string;
  content?: string;
  snapshot?: Record<string, unknown>;
}

interface Agent {
  userId: string;
  displayName?: string;
  level: number;
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

  // Dialog states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);

  // Form states
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>(TicketPriority.Medium);

  // Agents list
  const [agents, setAgents] = useState<Agent[]>([]);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}`, {
        credentials: "include",
      });
      const data = (await res.json()) as { ok: boolean; data: { ticket: TicketDetail; timeline: TimelineEntry[] } };
      if (data.ok) {
        setTicket(data.data.ticket);
        setTimeline(data.data.timeline || []);
      }
    } catch (error) {
      console.error("Failed to fetch ticket:", error);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/tob/admin/agents?active=true", {
        credentials: "include",
      });
      const data = (await res.json()) as { ok: boolean; data: Agent[] };
      if (data.ok) {
        setAgents(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  }, []);

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
      fetchAgents();
    }
  }, [ticketId, fetchTicket, fetchAgents]);

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
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setReplyContent("");
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedAssignee) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assigneeId: selectedAssignee }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setAssignDialogOpen(false);
        setSelectedAssignee("");
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to assign ticket:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: escalateReason }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setEscalateDialogOpen(false);
        setEscalateReason("");
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to escalate ticket:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: closeReason }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setCloseDialogOpen(false);
        setCloseReason("");
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to close ticket:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePriorityChange = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tob/tickets/${ticketId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priority: selectedPriority }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setPriorityDialogOpen(false);
        fetchTicket();
      }
    } catch (error) {
      console.error("Failed to change priority:", error);
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

  const isClosed = ticket.status === TicketStatus.Closed;

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <p className="text-sm text-muted-foreground font-mono">{ticket.id}</p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2">
          <Badge variant={statusColors[ticket.status]}>
            {t.tickets.status[ticket.status]}
          </Badge>
          <Badge variant={priorityColors[ticket.priority]}>
            {t.tickets.priority[ticket.priority]}
          </Badge>

          {!isClosed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAssignDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t.tickets.actions.assign}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEscalateDialogOpen(true)}>
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  {t.tickets.actions.escalate}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectedPriority(ticket.priority);
                  setPriorityDialogOpen(true);
                }}>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {t.tickets.actions.changePriority}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setCloseDialogOpen(true)}
                  className="text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {t.tickets.actions.close}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                {timeline.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    {t.tickets.detail.noReplies}
                  </p>
                ) : (
                  timeline.map((entry) => (
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
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reply Form */}
          {!isClosed && (
            <Card>
              <CardHeader>
                <CardTitle>{t.tickets.actions.reply}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Textarea
                    className="min-h-[120px]"
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
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.detail.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">{t.tickets.detail.customer}</Label>
                <p>{ticket.customerEmail}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t.tickets.detail.assignee}</Label>
                <p>{ticket.assigneeId || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t.tickets.detail.createdAt}</Label>
                <p>{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t.tickets.detail.updatedAt}</Label>
                <p>{new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
              {ticket.sla && (ticket.sla.acceptBreached || ticket.sla.replyBreached) && (
                <div>
                  <Badge variant="destructive">{t.tickets.detail.slaBreached}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.assign}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t.tickets.actions.assignTo}</Label>
            <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder={t.tickets.actions.assignPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.userId} value={agent.userId}>
                    {agent.displayName || agent.userId} (Lv.{agent.level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleAssign} disabled={submitting || !selectedAssignee}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.escalate}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t.tickets.actions.escalateReason}</Label>
            <Textarea
              className="mt-2"
              placeholder={t.tickets.actions.escalatePlaceholder}
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleEscalate} disabled={submitting}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.close}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t.tickets.actions.closeReason}</Label>
            <Textarea
              className="mt-2"
              placeholder={t.tickets.actions.closePlaceholder}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={handleClose} disabled={submitting}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.changePriority}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t.common.priority}</Label>
            <Select
              value={selectedPriority}
              onValueChange={(v) => setSelectedPriority(v as TicketPriority)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TicketPriority).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.tickets.priority[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriorityDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handlePriorityChange}
              disabled={submitting || selectedPriority === ticket.priority}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
