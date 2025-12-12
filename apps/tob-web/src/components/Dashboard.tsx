import { useMemo } from 'react';
import type { Ticket } from '@onfire/shared';
import { StatCard, ScrollArea, Badge, Separator } from '@onfire/ui';
import {
  Ticket as TicketIcon,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Package,
  Users,
  CheckCircle2
} from 'lucide-react';

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

interface DashboardProps {
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
}

export function Dashboard({ summary, tickets, onOpen, selectedId }: DashboardProps) {
  const stats = useMemo(
    () => [
      {
        title: '待处理工单',
        value: summary.pendingTickets,
        hint: '等待处理的工单总数',
        icon: <TicketIcon className="h-4 w-4" />
      },
      {
        title: '升级中',
        value: summary.escalated,
        hint: '已升级等待处理',
        icon: <ArrowUpRight className="h-4 w-4" />
      },
      {
        title: '超时工单',
        value: summary.overdue ?? 0,
        hint: 'SLA 超时未处理',
        icon: <Clock className="h-4 w-4" />
      },
      {
        title: '产品数',
        value: summary.products,
        hint: '接入的产品总数',
        icon: <Package className="h-4 w-4" />
      },
      {
        title: '租户数',
        value: summary.tenants,
        hint: '系统租户总数',
        icon: <Building2 className="h-4 w-4" />
      }
    ],
    [summary]
  );

  return (
    <div className="h-full p-6">
      <ScrollArea className="h-full">
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => (
              <StatCard
                key={stat.title}
                title={stat.title}
                value={stat.value}
                hint={stat.hint}
                icon={stat.icon}
              />
            ))}
          </div>

          {summary.scope && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>当前视角: {summary.scope}</span>
            </div>
          )}

          {/* Quick View Tickets */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <TicketIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">待处理工单</h2>
                <Badge variant="secondary" size="sm">
                  按优先级排序
                </Badge>
              </div>
            </div>
            <div className="divide-y divide-border">
              {tickets.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  暂无待处理工单
                </div>
              ) : (
                tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedId === ticket.id}
                    onClick={() => onOpen(ticket.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Three Column Layout for Categories */}
          <div className="grid gap-4 lg:grid-cols-3">
            <TicketCategoryCard
              title="待处理 Top"
              icon={<TicketIcon className="h-4 w-4" />}
              tickets={summary.topPending ?? []}
              emptyText="暂无待处理工单"
              onOpen={onOpen}
            />
            <TicketCategoryCard
              title="超时工单"
              icon={<Clock className="h-4 w-4" />}
              tickets={summary.topOverdue ?? []}
              emptyText="暂无超时工单"
              variant="warning"
              onOpen={onOpen}
            />
            <TicketCategoryCard
              title="升级中"
              icon={<ArrowUpRight className="h-4 w-4" />}
              tickets={summary.topEscalated ?? []}
              emptyText="暂无升级工单"
              variant="info"
              onOpen={onOpen}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  onClick
}: {
  ticket: Ticket;
  selected?: boolean;
  onClick: () => void;
}) {
  const isOverdue = ticket.sla?.acceptBreached || ticket.sla?.replyBreached;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        selected ? 'bg-muted' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{ticket.subject}</span>
          {isOverdue && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>#{ticket.id.slice(0, 8)}</span>
          <span>·</span>
          <span>{ticket.productId}</span>
          {ticket.assigneeId && (
            <>
              <span>·</span>
              <span>{ticket.assigneeId}</span>
            </>
          )}
        </div>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        <Badge variant={statusConfig[ticket.status]?.variant ?? 'default'} size="sm">
          {statusConfig[ticket.status]?.label ?? ticket.status}
        </Badge>
        <Badge variant={priorityConfig[ticket.priority]?.variant ?? 'default'} size="sm">
          {priorityConfig[ticket.priority]?.label ?? ticket.priority}
        </Badge>
      </div>
    </button>
  );
}

function TicketCategoryCard({
  title,
  icon,
  tickets,
  emptyText,
  variant = 'default',
  onOpen
}: {
  title: string;
  icon: React.ReactNode;
  tickets: Ticket[];
  emptyText: string;
  variant?: 'default' | 'warning' | 'info';
  onOpen: (id: string) => void;
}) {
  const variantStyles = {
    default: 'border-border',
    warning: 'border-amber-200 dark:border-amber-900/50',
    info: 'border-sky-200 dark:border-sky-900/50'
  };

  const headerStyles = {
    default: 'border-border',
    warning: 'border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20',
    info: 'border-sky-200 bg-sky-50/50 dark:border-sky-900/50 dark:bg-sky-950/20'
  };

  return (
    <div className={`rounded-xl border bg-card ${variantStyles[variant]}`}>
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${headerStyles[variant]}`}>
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="font-medium">{title}</h3>
        <Badge variant="secondary" size="sm">
          {tickets.length}
        </Badge>
      </div>
      <div className="divide-y divide-border">
        {tickets.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          tickets.slice(0, 5).map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onOpen(ticket.id)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{ticket.subject}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {ticket.productId} · {ticket.teamId}
                </div>
              </div>
              <Badge
                variant={priorityConfig[ticket.priority]?.variant ?? 'default'}
                size="sm"
                className="ml-2 flex-shrink-0"
              >
                {priorityConfig[ticket.priority]?.label ?? ticket.priority}
              </Badge>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
