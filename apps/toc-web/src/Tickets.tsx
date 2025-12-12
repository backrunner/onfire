import { useEffect, useState } from 'react';
import type { Ticket, TicketStatus } from '@onfire/shared';
import { type OnfireClient, type TicketDetail } from '@onfire/sdk';
import {
  Button,
  StatCard,
  Badge,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Avatar,
  useTranslation
} from '@onfire/ui';
import {
  Ticket as TicketIcon,
  Clock,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  AlertTriangle,
  History,
  ChevronRight,
  X
} from 'lucide-react';

const statusVariants: Record<string, 'new' | 'processing' | 'replied' | 'closed' | 'escalated'> = {
  new: 'new',
  processing: 'processing',
  replied: 'replied',
  escalated: 'escalated',
  closed: 'closed'
};

const priorityVariants: Record<string, 'high' | 'medium' | 'low'> = {
  high: 'high',
  medium: 'medium',
  low: 'low'
};

const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default function Tickets({
  client,
  productId,
  turnstileToken
}: {
  client: OnfireClient;
  productId: string;
  turnstileToken?: string;
}) {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'priority'>('recent');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [loading, setLoading] = useState(false);
  const [replyError, setReplyError] = useState('');

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await client.listTickets({ pageSize: 30, status: status || undefined, productId });
      setTickets(applySort(res.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [client, sortBy, status, productId]);

  const applySort = (data: Ticket[]) => {
    if (sortBy === 'priority') {
      return [...data].sort((a, b) => {
        const scoreA = (priorityWeight[a.priority] ?? 0) * 1000 + (a.customerLevel ?? 0);
        const scoreB = (priorityWeight[b.priority] ?? 0) * 1000 + (b.customerLevel ?? 0);
        return scoreB - scoreA;
      });
    }
    return [...data].sort((a, b) =>
      (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
    );
  };

  const openTicket = (id: string) => {
    client
      .getTicket(id)
      .then(setSelected)
      .catch(() => setSelected(null));
  };

  const submitReply = async () => {
    if (!selected || !reply.trim()) return;
    if (!turnstileToken) {
      setReplyError(t('detail.turnstileRequired'));
      return;
    }
    setReplyError('');
    setSending(true);
    try {
      await client.reply(selected.ticket.id, { content: reply, turnstileToken });
      setReply('');
      openTicket(selected.ticket.id);
    } catch (err) {
      setReplyError(t('detail.replyFailed'));
    } finally {
      setSending(false);
    }
  };

  const stats = {
    total: tickets.length,
    new: tickets.filter((t) => t.status === 'new').length,
    replied: tickets.filter((t) => t.status === 'replied').length,
    escalated: tickets.filter((t) => t.status === 'escalated').length
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title={t('tickets.total')}
          value={stats.total}
          icon={<TicketIcon className="h-4 w-4" />}
          hint={t('tickets.totalHint')}
        />
        <StatCard
          title={t('tickets.pending')}
          value={stats.new}
          icon={<Clock className="h-4 w-4" />}
          hint={t('tickets.pendingHint')}
        />
        <StatCard
          title={t('tickets.replied')}
          value={stats.replied}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint={t('tickets.repliedHint')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ticket List */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <TicketIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('tickets.title')}</span>
              <Badge variant="secondary" size="sm">
                {tickets.length}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={fetchTickets} loading={loading}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : (v as TicketStatus))}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tickets.filters.allStatus')}</SelectItem>
                <SelectItem value="new">{t('tickets.filters.new')}</SelectItem>
                <SelectItem value="processing">{t('tickets.filters.processing')}</SelectItem>
                <SelectItem value="replied">{t('tickets.filters.replied')}</SelectItem>
                <SelectItem value="escalated">{t('tickets.filters.escalated')}</SelectItem>
                <SelectItem value="closed">{t('tickets.filters.closed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t('tickets.sort.recent')}</SelectItem>
                <SelectItem value="priority">{t('tickets.sort.priority')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* List */}
          <ScrollArea className="h-96">
            <div className="divide-y divide-border">
              {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <TicketIcon className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">{t('tickets.noTickets')}</p>
                </div>
              ) : (
                tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => openTicket(ticket.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      selected?.ticket.id === ticket.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{ticket.subject}</span>
                        {(ticket.sla?.acceptBreached || ticket.sla?.replyBreached) && (
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{formatTime(ticket.updatedAt ?? ticket.createdAt, t)}</span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Badge variant={statusVariants[ticket.status] ?? 'default'} size="sm">
                        {t(`tickets.status.${ticket.status}`)}
                      </Badge>
                      <Badge variant={priorityVariants[ticket.priority] ?? 'default'} size="sm">
                        {t(`tickets.priority.${ticket.priority}`)}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Ticket Detail */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          {selected ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{selected.ticket.subject}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">#{selected.ticket.id.slice(0, 8)}</span>
                    <span>·</span>
                    <Badge variant={statusVariants[selected.ticket.status] ?? 'default'} size="sm">
                      {t(`tickets.status.${selected.ticket.status}`)}
                    </Badge>
                    <Badge variant={priorityVariants[selected.ticket.priority] ?? 'default'} size="sm">
                      {t(`tickets.priority.${selected.ticket.priority}`)}
                    </Badge>
                    {(selected.ticket.sla?.acceptBreached || selected.ticket.sla?.replyBreached) && (
                      <Badge variant="warning" size="sm">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {t('tickets.slaWarning')}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Content */}
              <div className="border-b border-border p-4">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="whitespace-pre-wrap text-sm">{selected.ticket.content}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{t('detail.team')}: {selected.ticket.teamId}</Badge>
                  <Badge variant="secondary">{t('detail.product')}: {selected.ticket.productId}</Badge>
                  {selected.ticket.customerLevel !== undefined && (
                    <Badge variant="secondary">{t('detail.level')} Lv.{selected.ticket.customerLevel}</Badge>
                  )}
                </div>
              </div>

              {/* Timeline & Replies */}
              <ScrollArea className="h-64">
                <div className="divide-y divide-border">
                  {/* History */}
                  {(selected.history ?? []).length > 0 && (
                    <div className="p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <History className="h-3.5 w-3.5" />
                        {t('detail.history')}
                      </div>
                      <div className="space-y-2">
                        {(selected.history ?? []).map((h: any) => (
                          <div
                            key={h.id}
                            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" size="sm">
                                {h.action}
                              </Badge>
                              {h.snapshot && (
                                <span className="text-muted-foreground">
                                  {typeof h.snapshot === 'string' ? h.snapshot : JSON.stringify(h.snapshot)}
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground">{formatTime(h.createdAt, t)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  <div className="p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {t('detail.replies')}
                      <Badge variant="secondary" size="sm">
                        {(selected.replies ?? []).length}
                      </Badge>
                    </div>
                    {(selected.replies ?? []).length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">{t('detail.noReplies')}</div>
                    ) : (
                      <div className="space-y-3">
                        {(selected.replies ?? []).map((r: any) => (
                          <div key={r.id} className="rounded-lg border border-border p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  size="sm"
                                  alt={r.senderEmail ?? t('common.system')}
                                  fallback={r.senderEmail?.[0] ?? 'S'}
                                />
                                <span className="text-sm font-medium">{r.senderEmail ?? t('common.system')}</span>
                                {r.internal && (
                                  <Badge variant="secondary" size="sm">
                                    {t('detail.internal')}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{formatTime(r.createdAt, t)}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm">{r.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* Reply Form */}
              <div className="border-t border-border p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Send className="h-3.5 w-3.5" />
                  {t('detail.replyForm')}
                </div>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t('detail.replyPlaceholder')}
                  rows={3}
                  className="mb-2 resize-none"
                />
                {replyError && (
                  <div className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {replyError}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitReply} loading={sending} disabled={!reply.trim()}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {t('detail.sendReply')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">{t('detail.selectTicket')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(time: string, t: (key: string, params?: Record<string, string>) => string): string {
  try {
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.minutesAgo', { count: String(mins) });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('time.hoursAgo', { count: String(hours) });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('time.daysAgo', { count: String(days) });
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return time;
  }
}
