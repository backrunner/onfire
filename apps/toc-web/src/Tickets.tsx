import { useEffect, useState } from 'react';
import type { Ticket } from '@onfire/shared';
import { type OnfireClient, type TicketDetail } from '@onfire/sdk';
import { Panel, Button, StatCard } from '@onfire/ui';

export default function Tickets({ client, productId }: { client: OnfireClient; productId: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'priority'>('recent');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    client
      .listTickets({ pageSize: 30, status, productId })
      .then((res: { data: Ticket[] }) => setTickets(applySort(res.data)));
  }, [client, sortBy, status, productId]);

  const applySort = (data: Ticket[]) => {
    if (sortBy === 'priority') {
      const weight: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return [...data].sort((a, b) => (weight[a.priority] ?? 99) - (weight[b.priority] ?? 99));
    }
    return [...data].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  };

  const openTicket = (id: string) => {
    client.getTicket(id).then(setSelected).catch(() => setSelected(null));
  };

  const submitReply = async () => {
    if (!selected || !reply) return;
    await client.reply(selected.ticket.id, { content: reply });
    setReply('');
    openTicket(selected.ticket.id);
  };

  const badgeClass = 'inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600';
  const inputClass =
    'h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100';

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
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">全部状态</option>
              <option value="new">New</option>
              <option value="processing">Processing</option>
              <option value="replied">Replied</option>
              <option value="closed">Closed</option>
            </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className={inputClass}>
              <option value="recent">按更新时间</option>
              <option value="priority">按优先级</option>
            </select>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  client
                    .listTickets({ pageSize: 30, status, productId })
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
            <span>优先级</span>
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
                <span className="text-xs text-zinc-700">{t.priority}</span>
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
              <span className={badgeClass}>状态: {selected.ticket.status}</span>
              <span className={badgeClass}>优先级: {selected.ticket.priority}</span>
              <span className={badgeClass}>Team: {selected.ticket.teamId}</span>
              <span className={badgeClass}>Product: {selected.ticket.productId}</span>
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
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="追加回复"
                rows={3}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100"
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

