import { useEffect, useState } from 'react';
import type { Ticket, TicketStatus } from '@onfire/shared';
import { type OnfireClient, type TicketDetail } from '@onfire/sdk';
import { Panel, Button, StatCard, Badge, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@onfire/ui';

const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default function Tickets({ client, productId, turnstileToken }: { client: OnfireClient; productId: string; turnstileToken?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'priority'>('recent');
  const [status, setStatus] = useState<TicketStatus | ''>('');

  useEffect(() => {
    client
      .listTickets({ pageSize: 30, status: status || undefined, productId })
      .then((res: { data: Ticket[] }) => setTickets(applySort(res.data)));
  }, [client, sortBy, status, productId]);

  const applySort = (data: Ticket[]) => {
    if (sortBy === 'priority') {
      return [...data].sort((a, b) => {
        const scoreA = (priorityWeight[a.priority] ?? 0) * 1000 + (a.customerLevel ?? 0);
        const scoreB = (priorityWeight[b.priority] ?? 0) * 1000 + (b.customerLevel ?? 0);
        return scoreB - scoreA;
      });
    }
    return [...data].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  };

  const openTicket = (id: string) => {
    client.getTicket(id).then(setSelected).catch(() => setSelected(null));
  };

  const submitReply = async () => {
    if (!selected || !reply) return;
    if (!turnstileToken) {
      alert('请先通过验证码，再提交回复');
      return;
    }
    await client.reply(selected.ticket.id, { content: reply, turnstileToken });
    setReply('');
    openTicket(selected.ticket.id);
  };

  const inputClass =
    'h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="工单数" value={String(tickets.length)} />
        <StatCard title="待处理" value={String(tickets.filter((t) => t.status === 'new').length)} />
        <StatCard title="已回复" value={String(tickets.filter((t) => t.status === 'replied').length)} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <Panel
        title="我的工单"
        description="点击查看详情"
        action={
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="w-40">
                <Select value={status || ''} onValueChange={(v: string) => setStatus((v as TicketStatus) || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Select value={sortBy} onValueChange={(v: string) => setSortBy(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="排序" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">按更新时间</SelectItem>
                    <SelectItem value="priority">按优先级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  client
                    .listTickets({ pageSize: 30, status: status || undefined, productId })
                    .then((res: { data: Ticket[] }) => setTickets(applySort(res.data)))
                }
              >
              刷新
            </Button>
          </div>
        }
      >
          <div className="grid grid-cols-[1.4fr_1fr_1fr] px-1 text-sm font-semibold text-zinc-600">
            <span>标题</span>
            <span>状态</span>
            <span>优先级 / 等级</span>
        </div>
          <div className="divide-y divide-zinc-100">
        {tickets.map((t) => (
          <button
            key={t.id}
            onClick={() => openTicket(t.id)}
                className={`grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 px-1 py-2 text-left transition hover:bg-zinc-50 ${
                  selected?.ticket.id === t.id ? 'bg-zinc-50' : ''
                }`}
          >
            <div>
                  <div className="font-semibold text-zinc-900">{t.subject}</div>
                  <div className="text-xs text-zinc-500">Ticket {t.id}</div>
            </div>
                <span className="text-xs text-sky-600">{t.status}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-700">
                  <Badge variant={t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'default'}>{t.priority}</Badge>
                  {t.customerLevel !== undefined && <Badge variant="secondary">等级 {t.customerLevel}</Badge>}
                </div>
          </button>
        ))}
          </div>
      </Panel>
      </div>

      {selected && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <Panel title={`工单 ${selected.ticket.id}`} description="查看历史、追加回复">
          <div className="mb-3 space-y-1">
            <div className="text-lg font-semibold text-zinc-900">{selected.ticket.subject}</div>
            <div className="text-sm text-zinc-600">{selected.ticket.content}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="info">状态: {selected.ticket.status}</Badge>
              <Badge variant="warning">优先级: {selected.ticket.priority}</Badge>
              <Badge variant="secondary">Team: {selected.ticket.teamId}</Badge>
              <Badge variant="secondary">Product: {selected.ticket.productId}</Badge>
              {selected.ticket.customerLevel !== undefined && <Badge variant="secondary">等级 {selected.ticket.customerLevel}</Badge>}
              {selected.ticket.sla?.acceptBreached || selected.ticket.sla?.replyBreached ? <Badge variant="warning">SLA超时</Badge> : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">时间线</div>
              {(selected.history ?? []).map((h: any) => (
                <div key={h.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="flex items-center justify-between text-sm font-medium text-zinc-800">
                    <span>{h.action}</span>
                    <span className="text-xs text-zinc-500">{h.createdAt}</span>
                  </div>
                  {h.snapshot && (
                    <div className="text-xs text-zinc-600">{typeof h.snapshot === 'string' ? h.snapshot : JSON.stringify(h.snapshot)}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">回复</div>
              {(selected.replies ?? []).map((r: any) => (
                <div key={r.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-sm font-semibold text-zinc-800">{r.senderEmail ?? '系统'}</div>
                  <div className="text-sm text-zinc-700">{r.content}</div>
                  <div className="text-xs text-zinc-500">{r.createdAt}</div>
                </div>
              ))}
              <div className="flex flex-col gap-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="追加回复"
                rows={3}
                className="text-sm"
              />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitReply}>
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Panel>
        </div>
      )}
    </div>
  );
}

