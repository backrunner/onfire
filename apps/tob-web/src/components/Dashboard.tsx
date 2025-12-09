import type { Ticket } from '@onfire/shared';
import { Panel, StatCard, Badge } from '@onfire/ui';

const statusColor: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' }> = {
  new: { label: '新建', variant: 'info' },
  processing: { label: '处理中', variant: 'info' },
  replied: { label: '已回复', variant: 'success' },
  escalated: { label: '升级中', variant: 'warning' },
  closed: { label: '已关闭', variant: 'default' }
};

export function Dashboard({
  summary,
  tickets,
  onOpen,
  selectedId
}: {
  summary: {
    tenants: number;
    products: number;
    pendingTickets: number;
    escalated: number;
    overdue?: number;
    topPending?: Ticket[];
    topOverdue?: Ticket[];
    topEscalated?: Ticket[];
    scope?: string;
  };
  tickets: Ticket[];
  onOpen: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <StatCard title="待处理" value={String(summary.pendingTickets)} hint="含升级/超时提示" />
        <StatCard title="产品" value={String(summary.products)} />
        <StatCard title="租户" value={String(summary.tenants)} />
        <StatCard title="升级中" value={String(summary.escalated)} />
        {summary.overdue !== undefined && <StatCard title="超时" value={String(summary.overdue)} hint="SLA 接单/回复超时" />}
      </div>
      {summary.scope && (
        <div className="text-xs text-zinc-500">视角：{summary.scope}</div>
      )}
      <Panel title="待处理 Top 6" description="按优先级排序">
        <div className="space-y-2">
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => onOpen(t.id)}
              className={`flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm transition hover:bg-zinc-50 ${
                selectedId === t.id ? 'ring-2 ring-zinc-300' : ''
              }`}
            >
              <div>
                <div className="font-semibold text-zinc-900">{t.subject}</div>
                <div className="text-xs text-zinc-500">#{t.id} · {t.productId}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusColor[t.status]?.variant ?? 'default'}>{statusColor[t.status]?.label ?? t.status}</Badge>
                <Badge variant={t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'default'}>{t.priority}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="待处理 (后端排序)" description="按优先级+更新时间">
          <div className="space-y-2 text-sm">
            {(summary.topPending ?? []).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1">
                <div>
                  <div className="font-semibold text-zinc-900">{t.subject}</div>
                  <div className="text-[11px] text-zinc-500">{t.productId} · {t.teamId}</div>
                </div>
                <Badge variant={t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'default'}>{t.priority}</Badge>
              </div>
            ))}
            {(summary.topPending ?? []).length === 0 && <div className="text-xs text-zinc-500">暂无数据</div>}
          </div>
        </Panel>
        <Panel title="超时" description="SLA 接单/回复超时">
          <div className="space-y-2 text-sm">
            {(summary.topOverdue ?? []).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border border-amber-100 bg-amber-50 px-2 py-1">
                <div>
                  <div className="font-semibold text-zinc-900">{t.subject}</div>
                  <div className="text-[11px] text-amber-700">{t.productId} · {t.teamId}</div>
                </div>
                <Badge variant="warning">超时</Badge>
              </div>
            ))}
            {(summary.topOverdue ?? []).length === 0 && <div className="text-xs text-zinc-500">暂无数据</div>}
          </div>
        </Panel>
        <Panel title="升级中" description="自动分配给高等级坐席">
          <div className="space-y-2 text-sm">
            {(summary.topEscalated ?? []).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border border-sky-100 bg-sky-50 px-2 py-1">
                <div>
                  <div className="font-semibold text-zinc-900">{t.subject}</div>
                  <div className="text-[11px] text-sky-700">{t.productId} · {t.teamId}</div>
                </div>
                <Badge variant="info">升级中</Badge>
              </div>
            ))}
            {(summary.topEscalated ?? []).length === 0 && <div className="text-xs text-zinc-500">暂无数据</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

