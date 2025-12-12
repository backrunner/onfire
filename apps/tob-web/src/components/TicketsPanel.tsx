import { ChangeEvent } from 'react';
import type { Ticket, TicketPriority, TicketStatus } from '@onfire/shared';
import {
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Users,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  Badge,
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator
} from '@onfire/ui';
import { usePagination } from '../hooks/usePagination';

const statusConfig: Record<
  string,
  { label: string; variant: 'new' | 'processing' | 'replied' | 'escalated' | 'closed' }
> = {
  new: { label: '新建', variant: 'new' },
  processing: { label: '处理中', variant: 'processing' },
  replied: { label: '已回复', variant: 'replied' },
  escalated: { label: '升级中', variant: 'escalated' },
  closed: { label: '已关闭', variant: 'closed' }
};

const priorityConfig: Record<string, { label: string; variant: 'high' | 'medium' | 'low' }> = {
  high: { label: '高', variant: 'high' },
  medium: { label: '中', variant: 'medium' },
  low: { label: '低', variant: 'low' }
};

interface Props {
  filters: {
    status?: TicketStatus;
    priority?: TicketPriority;
    keyword?: string;
    team?: string;
    product?: string;
    overdue?: boolean;
  };
  setFilters: (f: Props['filters']) => void;
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
  const allSelected =
    pagination.current.length > 0 && pagination.current.every((t) => selectedIds.has(t.id));
  const someSelected = pagination.current.some((t) => selectedIds.has(t.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allSelected) {
      pagination.current.forEach((t) => next.delete(t.id));
    } else {
      pagination.current.forEach((t) => next.add(t.id));
    }
    setSelectedIds(next);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter Bar */}
      <div className="border-b border-border bg-card/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>筛选</span>
          </div>

          <Select
            value={filters.status ?? 'all'}
            onValueChange={(v) =>
              setFilters({ ...filters, status: v === 'all' ? undefined : (v as TicketStatus) })
            }
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="new">新建</SelectItem>
              <SelectItem value="processing">处理中</SelectItem>
              <SelectItem value="replied">已回复</SelectItem>
              <SelectItem value="escalated">升级中</SelectItem>
              <SelectItem value="closed">已关闭</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.priority ?? 'all'}
            onValueChange={(v) =>
              setFilters({ ...filters, priority: v === 'all' ? undefined : (v as TicketPriority) })
            }
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="优先级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部优先级</SelectItem>
              <SelectItem value="high">高</SelectItem>
              <SelectItem value="medium">中</SelectItem>
              <SelectItem value="low">低</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">按优先级</SelectItem>
              <SelectItem value="recent">按更新时间</SelectItem>
              <SelectItem value="overdue">按超时优先</SelectItem>
            </SelectContent>
          </Select>

          {teamOptions.length > 0 && (
            <Select
              value={filters.team ?? 'all'}
              onValueChange={(v) =>
                setFilters({ ...filters, team: v === 'all' ? undefined : v })
              }
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="团队" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部团队</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {productOptions.length > 0 && (
            <Select
              value={filters.product ?? 'all'}
              onValueChange={(v) =>
                setFilters({ ...filters, product: v === 'all' ? undefined : v })
              }
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="产品" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部产品</SelectItem>
                {productOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm transition-colors hover:bg-accent">
            <input
              type="checkbox"
              checked={filters.overdue ?? false}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFilters({ ...filters, overdue: e.target.checked || undefined })
              }
              className="h-3.5 w-3.5 rounded border-input"
            />
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>仅超时</span>
          </label>

          <div className="flex-1" />

          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              已选择 <strong className="text-foreground">{selectedIds.size}</strong> 项
            </span>
            <Separator orientation="vertical" className="h-4" />
            <Button
              size="sm"
              variant="outline"
              disabled={!canAssign}
              onClick={onOpenAssign}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              批量指派
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canClose}
              onClick={onOpenClose}
            >
              批量关闭
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              清除选择
            </Button>
          </div>
        )}
      </div>

      {/* Ticket List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {/* Header Row */}
          <div className="sticky top-0 z-10 flex items-center gap-3 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <button
              onClick={toggleSelectAll}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : someSelected ? (
                <div className="h-4 w-4 rounded border-2 border-primary bg-primary/20" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <span className="flex-1">工单</span>
            <span className="w-20 text-center">状态</span>
            <span className="w-16 text-center">优先级</span>
            <span className="w-24 text-center">SLA</span>
            <span className="w-32">更新时间</span>
          </div>

          {/* Ticket Rows */}
          {pagination.current.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Filter className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">没有找到匹配的工单</p>
            </div>
          ) : (
            pagination.current.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                selected={selectedId === ticket.id}
                checked={selectedIds.has(ticket.id)}
                onSelect={() => onOpen(ticket.id)}
                onCheck={(checked) => {
                  const next = new Set(selectedIds);
                  if (checked) next.add(ticket.id);
                  else next.delete(ticket.id);
                  setSelectedIds(next);
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border bg-card/50 px-4 py-2">
        <span className="text-sm text-muted-foreground">
          共 {pagination.total} 条 · 第 {pagination.page} / {pagination.pages} 页
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={pagination.prev}
            disabled={pagination.page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={pagination.next}
            disabled={pagination.page >= pagination.pages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  checked,
  onSelect,
  onCheck
}: {
  ticket: Ticket;
  selected?: boolean;
  checked?: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
}) {
  const isOverdue = ticket.sla?.acceptBreached || ticket.sla?.replyBreached;

  return (
    <div
      className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 ${
        selected ? 'bg-accent' : ''
      }`}
      onClick={onSelect}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCheck(!checked);
        }}
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
      >
        {checked ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{ticket.subject}</span>
          {isOverdue && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
          <span>·</span>
          <span>{ticket.productId}</span>
          <span>·</span>
          <span>{ticket.teamId}</span>
          {ticket.assigneeId && (
            <>
              <span>·</span>
              <span className="text-foreground">{ticket.assigneeId}</span>
            </>
          )}
        </div>
      </div>

      <div className="w-20 text-center">
        <Badge variant={statusConfig[ticket.status]?.variant ?? 'default'} size="sm">
          {statusConfig[ticket.status]?.label ?? ticket.status}
        </Badge>
      </div>

      <div className="w-16 text-center">
        <Badge variant={priorityConfig[ticket.priority]?.variant ?? 'default'} size="sm">
          {priorityConfig[ticket.priority]?.label ?? ticket.priority}
        </Badge>
      </div>

      <div className="w-24 text-center">
        {isOverdue ? (
          <Badge variant="warning" size="sm">
            <Clock className="mr-1 h-3 w-3" />
            超时
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {ticket.sla?.acceptDeadline ? (
              <span className="block">接: {formatDeadline(ticket.sla.acceptDeadline)}</span>
            ) : null}
            {ticket.sla?.replyDeadline ? (
              <span className="block">复: {formatDeadline(ticket.sla.replyDeadline)}</span>
            ) : null}
          </span>
        )}
      </div>

      <div className="w-32 text-xs text-muted-foreground">
        {formatTime(ticket.updatedAt ?? ticket.createdAt)}
      </div>
    </div>
  );
}

function formatDeadline(deadline: string): string {
  try {
    const date = new Date(deadline);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff < 0) return '已过期';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分钟`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时`;
    return `${Math.floor(hours / 24)}天`;
  } catch {
    return deadline;
  }
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
    return date.toLocaleDateString('zh-CN');
  } catch {
    return time;
  }
}
