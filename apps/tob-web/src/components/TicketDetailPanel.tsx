import { ChangeEvent, FormEvent } from 'react';
import type { TicketDetail } from '../api';
import type { TicketPriority } from '@onfire/shared';
import { Badge, Button, Input, Textarea } from '@onfire/ui';
import { ArrowUpRight, Clock3, XCircle } from 'lucide-react';

const statusColor: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' }> = {
  new: { label: '新建', variant: 'info' },
  processing: { label: '处理中', variant: 'info' },
  replied: { label: '已回复', variant: 'success' },
  escalated: { label: '升级中', variant: 'warning' },
  closed: { label: '已关闭', variant: 'default' }
};

interface Props {
  ticket: TicketDetail;
  loading: boolean;
  assignTo: string;
  setAssignTo: (v: string) => void;
  onAssign: () => void;
  onClose: () => void;
  onEscalate: () => void;
  closeReason: string;
  setCloseReason: (v: string) => void;
  escalateReason: string;
  setEscalateReason: (v: string) => void;
  priorityDraft: TicketPriority;
  setPriorityDraft: (v: TicketPriority) => void;
  priorityReason: string;
  setPriorityReason: (v: string) => void;
  onChangePriority: () => void;
  replyText: string;
  setReplyText: (v: string) => void;
  onReply: (e: FormEvent) => void;
  onSelect: (checked: boolean) => void;
  selectedIds: Set<string>;
  canAssign: boolean;
  canClose: boolean;
  canEscalate: boolean;
  canReply: boolean;
}

export function TicketDetailPanel({
  ticket,
  loading,
  assignTo,
  setAssignTo,
  onAssign,
  onClose,
  onEscalate,
  closeReason,
  setCloseReason,
  escalateReason,
  setEscalateReason,
  priorityDraft,
  setPriorityDraft,
  priorityReason,
  setPriorityReason,
  onChangePriority,
  replyText,
  setReplyText,
  onReply,
  onSelect,
  selectedIds,
  canAssign,
  canClose,
  canEscalate,
  canReply
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300"
          checked={selectedIds.has(ticket.ticket.id)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSelect(e.target.checked)}
        />
        <Button size="sm" variant="outline" onClick={onEscalate} disabled={loading || !canEscalate || !escalateReason}>
          <ArrowUpRight className="mr-2 h-4 w-4" />
          升级
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={loading || !canClose || !closeReason}>
          <XCircle className="mr-2 h-4 w-4" />
          关闭
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input placeholder="升级原因" value={escalateReason} onChange={(e: ChangeEvent<HTMLInputElement>) => setEscalateReason(e.target.value)} />
        <Input placeholder="关闭原因" value={closeReason} onChange={(e: ChangeEvent<HTMLInputElement>) => setCloseReason(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold text-zinc-900">{ticket.ticket.subject}</div>
        <div className="text-sm text-zinc-600 whitespace-pre-wrap break-words">{ticket.ticket.content}</div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
          <Badge variant={statusColor[ticket.ticket.status]?.variant ?? 'default'}>
            {statusColor[ticket.ticket.status]?.label ?? ticket.ticket.status}
          </Badge>
          <Badge variant={ticket.ticket.priority === 'high' ? 'warning' : ticket.ticket.priority === 'medium' ? 'info' : 'default'}>
            优先级: {ticket.ticket.priority}
          </Badge>
          {ticket.ticket.sla?.acceptBreached || ticket.ticket.sla?.replyBreached ? (
            <Badge variant="warning">SLA 超时</Badge>
          ) : (
            <Badge variant="success">SLA 正常</Badge>
          )}
          <Badge variant="info">
            <Clock3 className="mr-1 h-3 w-3" />
            {ticket.ticket.updatedAt}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
          <div>Team: {ticket.ticket.teamId}</div>
          <div>Product: {ticket.ticket.productId}</div>
          <div>Assignee: {ticket.ticket.assigneeId ?? '未指派'}</div>
          <div>客户邮箱: {ticket.ticket.customerEmail}</div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <select
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
          value={priorityDraft}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setPriorityDraft(e.target.value as TicketPriority)}
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <Input placeholder="优先级调整理由" value={priorityReason} onChange={(e: ChangeEvent<HTMLInputElement>) => setPriorityReason(e.target.value)} />
        <Button size="sm" variant="outline" onClick={onChangePriority} loading={loading} disabled={!canReply || !priorityReason}>
          调整优先级
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="分配给坐席ID" value={assignTo} onChange={(e: ChangeEvent<HTMLInputElement>) => setAssignTo(e.target.value)} />
        <Button size="sm" onClick={onAssign} loading={loading} disabled={!canAssign}>
          指派
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-semibold text-zinc-900">时间线</div>
          <div className="space-y-2">
            {(ticket.history ?? []).map((h: any) => (
              <div key={h.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm font-semibold text-zinc-800">
                  <span>{h.action}</span>
                  <span className="text-xs text-zinc-500">{h.createdAt}</span>
                </div>
                {h.snapshot && <div className="text-xs text-zinc-600">{typeof h.snapshot === 'string' ? h.snapshot : JSON.stringify(h.snapshot)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-zinc-900">回复</div>
          <div className="space-y-2">
            {(ticket.replies ?? []).map((r: any) => (
              <div key={r.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <div className="text-sm font-semibold text-zinc-800">{r.senderId ?? r.senderEmail ?? '客户'}</div>
                <div className="text-sm text-zinc-700">{r.content}</div>
                <div className="text-xs text-zinc-500">{r.createdAt}</div>
              </div>
            ))}
          </div>
          <form onSubmit={onReply} className="mt-3 flex gap-2">
            <Textarea required value={replyText} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReplyText(e.target.value)} placeholder="回复内容" rows={3} />
            <Button type="submit" loading={loading} disabled={!canReply}>
              回复
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

