import { ChangeEvent, FormEvent } from 'react';
import type { TicketDetail } from '../api';
import type { TicketPriority } from '@onfire/shared';
import {
  Badge,
  Button,
  Input,
  Textarea,
  ScrollArea,
  Avatar,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator
} from '@onfire/ui';
import {
  ArrowUpRight,
  Clock,
  XCircle,
  MessageSquare,
  User,
  Building2,
  Mail,
  Send,
  History,
  FileText,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { AIPreReply } from './ai/AIPreReply';

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
  onBack?: () => void;
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
  canAssign,
  canClose,
  canEscalate,
  canReply,
  onBack
}: Props) {
  const t = ticket.ticket;
  const isOverdue = t.sla?.acceptBreached || t.sla?.replyBreached;
  const timeline = (ticket.timeline ?? []).map((item: any) => ({
    ...item,
    createdAt: item.createdAt ?? item?.at ?? ''
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{t.subject}</h2>
              {isOverdue && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">#{t.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{t.productId}</span>
              <span>·</span>
              <span>{t.teamId}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusConfig[t.status]?.variant ?? 'default'}>
              {statusConfig[t.status]?.label ?? t.status}
            </Badge>
            <Badge variant={priorityConfig[t.priority]?.variant ?? 'default'}>
              {priorityConfig[t.priority]?.label ?? t.priority}
            </Badge>
            {isOverdue ? (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                SLA 超时
              </Badge>
            ) : (
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                SLA 正常
              </Badge>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onEscalate}
            disabled={loading || !canEscalate || !escalateReason}
          >
            <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
            升级
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            disabled={loading || !canClose || !closeReason}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            关闭
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 w-32"
              placeholder="升级原因"
              value={escalateReason}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEscalateReason(e.target.value)}
            />
            <Input
              className="h-8 w-32"
              placeholder="关闭原因"
              value={closeReason}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCloseReason(e.target.value)}
            />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Ticket Content */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="whitespace-pre-wrap text-foreground">{t.content}</p>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Customer Info */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                客户信息
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">邮箱:</span>
                  <span className="font-medium">{t.customerEmail}</span>
                </div>
                {t.customerLevel !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">等级:</span>
                    <Badge variant="secondary" size="sm">
                      Lv.{t.customerLevel}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Assignment */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                处理信息
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">团队:</span>
                  <span className="font-medium">{t.teamId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">指派:</span>
                  <span className="font-medium">{t.assigneeId ?? '未指派'}</span>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Input
                    className="h-8 flex-1"
                    placeholder="坐席 ID"
                    value={assignTo}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAssignTo(e.target.value)}
                  />
                  <Button size="sm" onClick={onAssign} loading={loading} disabled={!canAssign}>
                    指派
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Priority Change */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              调整优先级
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={priorityDraft}
                onValueChange={(v) => setPriorityDraft(v as TicketPriority)}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8 flex-1"
                placeholder="调整理由（必填）"
                value={priorityReason}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPriorityReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={onChangePriority}
                loading={loading}
                disabled={!canReply || !priorityReason}
              >
                确认调整
              </Button>
            </div>
          </div>

          {/* Metadata */}
          <Accordion type="single" collapsible>
            <AccordionItem value="metadata" className="rounded-lg border border-border bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  自定义字段 / Metadata
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-40">
                  {t.metadata ? JSON.stringify(t.metadata, null, 2) : '无'}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Timeline & Replies */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Timeline */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">操作历史</h3>
                <Badge variant="secondary" size="sm">
                  {timeline.length}
                </Badge>
              </div>
              <ScrollArea className="h-64">
                <div className="divide-y divide-border">
                  {timeline.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      暂无操作记录
                    </div>
                  ) : (
                    timeline.map((item: any, i: number) => (
                      <div key={`${item.id}-${i}`} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={item.type === 'reply' ? 'info' : 'secondary'}
                              size="sm"
                            >
                              {item.type === 'reply' ? '回复' : item.action ?? '操作'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.senderId ?? item.actorId ?? '系统'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(item.createdAt)}
                          </span>
                        </div>
                        {item.snapshot && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {typeof item.snapshot === 'string'
                              ? item.snapshot
                              : JSON.stringify(item.snapshot)}
                          </p>
                        )}
                        {item.content && (
                          <p className="mt-1 text-sm whitespace-pre-wrap">{item.content}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Replies */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">回复记录</h3>
                <Badge variant="secondary" size="sm">
                  {(ticket.replies ?? []).length}
                </Badge>
              </div>
              <ScrollArea className="h-64">
                <div className="divide-y divide-border">
                  {(ticket.replies ?? []).length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      暂无回复记录
                    </div>
                  ) : (
                    (ticket.replies ?? []).map((r: any) => (
                      <div key={r.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar
                              size="sm"
                              alt={r.senderId ?? r.senderEmail ?? '客户'}
                              fallback={r.senderId?.[0] ?? r.senderEmail?.[0] ?? 'U'}
                            />
                            <span className="text-sm font-medium">
                              {r.senderId ?? r.senderEmail ?? '客户'}
                            </span>
                            {r.internal && (
                              <Badge variant="secondary" size="sm">
                                内部
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap">{r.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* AI Pre-Reply */}
          <AIPreReply ticketId={t.id} onUseReply={setReplyText} />

          {/* Reply Form */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Send className="h-4 w-4 text-muted-foreground" />
              回复工单
            </h3>
            <form onSubmit={onReply} className="space-y-3">
              <Textarea
                required
                value={replyText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReplyText(e.target.value)}
                placeholder="输入回复内容..."
                rows={4}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button type="submit" loading={loading} disabled={!canReply || !replyText.trim()}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  发送回复
                </Button>
              </div>
            </form>
          </div>
        </div>
      </ScrollArea>
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
