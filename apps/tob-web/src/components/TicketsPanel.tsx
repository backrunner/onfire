import { ChangeEvent } from 'react';
import type { Ticket, TicketPriority, TicketStatus } from '@onfire/shared';
import { Filter, RefreshCw } from 'lucide-react';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@onfire/ui';
import { usePagination } from '../hooks/usePagination';

const statusColor: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' }> = {
  new: { label: '新建', variant: 'info' },
  processing: { label: '处理中', variant: 'info' },
  replied: { label: '已回复', variant: 'success' },
  escalated: { label: '升级中', variant: 'warning' },
  closed: { label: '已关闭', variant: 'default' }
};

interface Props {
  filters: { status?: TicketStatus; priority?: TicketPriority; keyword?: string; team?: string; product?: string; overdue?: boolean };
  setFilters: (f: { status?: TicketStatus; priority?: TicketPriority; keyword?: string; team?: string; product?: string; overdue?: boolean }) => void;
  sortBy: 'priority' | 'recent' | 'overdue';
  setSortBy: (v: 'priority' | 'recent' | 'overdue') => void;
  tickets: Ticket[];
  teamOptions: string[];
  productOptions: string[];
  onRefresh: () => void;
  onOpen: (id: string) => void;
  selectedId?: string;
  pagination: ReturnType<typeof usePagination<Ticket>>;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  onOpenAssign: () => void;
  onOpenClose: () => void;
  canAssign: boolean;
  canClose: boolean;
}

export function TicketsPanel({
  filters,
  setFilters,
  sortBy,
  setSortBy,
  tickets,
  teamOptions,
  productOptions,
  onRefresh,
  onOpen,
  selectedId,
  pagination,
  selectedIds,
  setSelectedIds,
  onOpenAssign,
  onOpenClose,
  canAssign,
  canClose
}: Props) {
  const selectClass =
    'h-9 rounded-lg border border-input bg-background px-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Filter className="h-4 w-4" />
        <select
          className={selectClass}
          value={filters.status ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, status: (e.target.value as TicketStatus) || undefined })}
        >
          <option value="">状态: 全部</option>
          <option value="new">新建</option>
          <option value="processing">处理中</option>
          <option value="replied">已回复</option>
          <option value="escalated">升级中</option>
          <option value="closed">已关闭</option>
        </select>
        <select
          className={selectClass}
          value={filters.priority ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, priority: (e.target.value as TicketPriority) || undefined })}
        >
          <option value="">优先级: 全部</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <select
          className={selectClass}
          value={sortBy}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as any)}
        >
          <option value="priority">按优先级</option>
          <option value="recent">按更新时间</option>
          <option value="overdue">按超时优先</option>
        </select>
        <select
          className={selectClass}
          value={filters.team ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, team: e.target.value || undefined })}
        >
          <option value="">团队: 全部</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.product ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, product: e.target.value || undefined })}
        >
          <option value="">产品: 全部</option>
          {productOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={filters.overdue ?? false}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, overdue: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
          />
          仅超时
        </label>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
        <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || !canAssign} onClick={onOpenAssign}>
          批量指派
        </Button>
        <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || !canClose} onClick={onOpenClose}>
          批量关闭
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={pagination.current.length > 0 && pagination.current.every((t) => selectedIds.has(t.id))}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const next = new Set(selectedIds);
                  if (e.target.checked) pagination.current.forEach((t) => next.add(t.id));
                  else pagination.current.forEach((t) => next.delete(t.id));
                  setSelectedIds(next);
                }}
              />
            </TableHead>
            <TableHead>工单</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>优先级</TableHead>
            <TableHead>SLA</TableHead>
            <TableHead>团队/产品</TableHead>
            <TableHead>指派</TableHead>
            <TableHead>更新时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.current.map((t) => (
            <TableRow key={t.id} className={`cursor-pointer ${selectedId === t.id ? 'bg-zinc-50' : ''}`} onClick={() => onOpen(t.id)}>
              <TableCell>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={selectedIds.has(t.id)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    setSelectedIds(next);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableCell>
              <TableCell>
                <div className="font-semibold text-foreground">{t.subject}</div>
                <div className="text-xs text-muted-foreground">#{t.id}</div>
              </TableCell>
              <TableCell>
                <Badge variant={statusColor[t.status]?.variant ?? 'default'}>{statusColor[t.status]?.label ?? t.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'default'}>{t.priority}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t.sla?.acceptBreached || t.sla?.replyBreached ? (
                  <span className="text-amber-600">超时</span>
                ) : (
                  <>
                    <div>接单: {t.sla?.acceptDeadline ?? '--'}</div>
                    <div>回复: {t.sla?.replyDeadline ?? '--'}</div>
                  </>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <div>Team: {t.teamId}</div>
                <div>Prod: {t.productId}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{t.assigneeId ?? '未指派'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{t.updatedAt ?? t.createdAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-zinc-600">
        <span>
          共 {pagination.total} 条 · 第 {pagination.page}/{pagination.pages} 页
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={pagination.prev} disabled={pagination.page <= 1}>
            上一页
          </Button>
          <Button size="sm" variant="outline" onClick={pagination.next} disabled={pagination.page >= pagination.pages}>
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

