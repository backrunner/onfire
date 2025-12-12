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
  Avatar
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

const statusConfig: Record<string, { label: string; variant: 'new' | 'processing' | 'replied' | 'closed' | 'escalated' }> = {
  new: { label: '待处理', variant: 'new' },
  processing: { label: '处理中', variant: 'processing' },
  replied: { label: '已回复', variant: 'replied' },
  escalated: { label: '已升级', variant: 'escalated' },
  closed: { label: '已关闭', variant: 'closed' }
};

const priorityConfig: Record<string, { label: string; variant: 'high' | 'medium' | 'low' }> = {
  high: { label: '高', variant: 'high' },
  medium: { label: '中', variant: 'medium' },
  low: { label: '低', variant: 'low' }
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
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'priority'>('recent');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [loading, setLoading] = useState(false);

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
      alert('请先通过验证码，再提交回复');
      return;
    }
    setSending(true);
    try {
      await client.reply(selected.ticket.id, { content: reply, turnstileToken });
      setReply('');
      openTicket(selected.ticket.id);
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
          title="全部工单"
          value={stats.total}
          icon={<TicketIcon className="h-4 w-4" />}
          hint="我提交的工单总数"
        />
        <StatCard
          title="待处理"
          value={stats.new}
          icon={<Clock className="h-4 w-4" />}
          hint="等待客服处理"
        />
        <StatCard
          title="已回复"
          value={stats.replied}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint="客服已回复"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ticket List */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <TicketIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">我的工单</span>
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
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="new">待处理</SelectItem>
                <SelectItem value="processing">处理中</SelectItem>
                <SelectItem value="replied">已回复</SelectItem>
                <SelectItem value="escalated">已升级</SelectItem>
                <SelectItem value="closed">已关闭</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">按更新时间</SelectItem>
                <SelectItem value="priority">按优先级</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* List */}
          <ScrollArea className="h-96">
            <div className="divide-y divide-border">
              {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <TicketIcon className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">暂无工单</p>
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                      selected?.ticket.id === t.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t.subject}</span>
                        {(t.sla?.acceptBreached || t.sla?.replyBreached) && (
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">#{t.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{formatTime(t.updatedAt ?? t.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Badge variant={statusConfig[t.status]?.variant ?? 'default'} size="sm">
                        {statusConfig[t.status]?.label ?? t.status}
                      </Badge>
                      <Badge variant={priorityConfig[t.priority]?.variant ?? 'default'} size="sm">
                        {priorityConfig[t.priority]?.label ?? t.priority}
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
                    <Badge variant={statusConfig[selected.ticket.status]?.variant ?? 'default'} size="sm">
                      {statusConfig[selected.ticket.status]?.label ?? selected.ticket.status}
                    </Badge>
                    <Badge variant={priorityConfig[selected.ticket.priority]?.variant ?? 'default'} size="sm">
                      {priorityConfig[selected.ticket.priority]?.label ?? selected.ticket.priority}
                    </Badge>
                    {(selected.ticket.sla?.acceptBreached || selected.ticket.sla?.replyBreached) && (
                      <Badge variant="warning" size="sm">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        SLA 超时
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
                  <Badge variant="secondary">团队: {selected.ticket.teamId}</Badge>
                  <Badge variant="secondary">产品: {selected.ticket.productId}</Badge>
                  {selected.ticket.customerLevel !== undefined && (
                    <Badge variant="secondary">等级 Lv.{selected.ticket.customerLevel}</Badge>
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
                        操作历史
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
                            <span className="text-muted-foreground">{formatTime(h.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  <div className="p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      回复记录
                      <Badge variant="secondary" size="sm">
                        {(selected.replies ?? []).length}
                      </Badge>
                    </div>
                    {(selected.replies ?? []).length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">暂无回复</div>
                    ) : (
                      <div className="space-y-3">
                        {(selected.replies ?? []).map((r: any) => (
                          <div key={r.id} className="rounded-lg border border-border p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  size="sm"
                                  alt={r.senderEmail ?? '系统'}
                                  fallback={r.senderEmail?.[0] ?? 'S'}
                                />
                                <span className="text-sm font-medium">{r.senderEmail ?? '系统'}</span>
                                {r.internal && (
                                  <Badge variant="secondary" size="sm">
                                    内部
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</span>
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
                  追加回复
                </div>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="输入回复内容..."
                  rows={3}
                  className="mb-2 resize-none"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitReply} loading={sending} disabled={!reply.trim()}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    发送
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">选择工单查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(time: string): string {
  try {
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return time;
  }
}
