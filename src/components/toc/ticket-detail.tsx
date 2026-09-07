"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  Headset,
  Loader2,
  Lock,
  Send,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { tocApi, ApiClientError } from "@/lib/api/toc-client";
import { notifyTocSessionExpired, readTocCredentials } from "@/lib/toc-session";
import { rewriteTocAttachmentUrls, tocPath } from "@/lib/toc-path";
import {
  formatDateTime,
  type TocReply,
  type TocTicket,
} from "@/lib/toc/portal";
import { RichTextView } from "@/components/rich-text-view";
import {
  RichTextEditor,
  type RichTextEditorHandle,
  type RichTextValue,
} from "@/components/lazy-rich-text-editor";
import { TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TocStatusBadge } from "./status-badge";
import {
  TurnstileWidget,
  turnstileEnabled,
  type TurnstileInstance,
} from "./turnstile-widget";

interface TicketDetailProps {
  ticket: TocTicket;
  replies: TocReply[];
  onBack: () => void;
  /** Refetch the ticket after a successful reply / escalation. */
  onRefresh: () => void;
}

interface Message {
  id: string;
  content: string;
  contentHtml?: string | null;
  fromAgent: boolean;
  createdAt: string;
}

function MessageBubble({ message, agentLabel, youLabel }: {
  message: Message;
  agentLabel: string;
  youLabel: string;
}) {
  const { fromAgent } = message;
  return (
    <div className={cn("flex gap-2.5", fromAgent ? "justify-start" : "justify-end")}>
      {fromAgent && (
        <Avatar className="mt-0.5 size-7 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Headset className="size-3.5" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[85%] space-y-1", !fromAgent && "items-end")}>
        <div
          className={cn(
            "flex items-baseline gap-2 text-[11px] text-muted-foreground",
            !fromAgent && "flex-row-reverse"
          )}
        >
          <span className="font-medium">{fromAgent ? agentLabel : youLabel}</span>
          <time dateTime={message.createdAt}>
            {formatDateTime(message.createdAt)}
          </time>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm break-words transition-colors",
            fromAgent
              ? "rounded-tl-sm bg-muted text-foreground"
              : "rounded-tr-sm bg-primary text-primary-foreground",
            !message.contentHtml && "whitespace-pre-wrap"
          )}
        >
          {message.contentHtml ? (
            <RichTextView html={rewriteTocAttachmentUrls(message.contentHtml)} />
          ) : (
            message.content
          )}
        </div>
      </div>
    </div>
  );
}

export function TicketDetail({ ticket, replies, onBack, onRefresh }: TicketDetailProps) {
  const { t, language } = useI18n();

  // Reply composer
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [draft, setDraft] = useState<RichTextValue>({
    html: "",
    text: "",
    empty: true,
  });
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  // Escalation
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [escalateTurnstileToken, setEscalateTurnstileToken] = useState<
    string | null
  >(null);
  const escalateTurnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  const isClosed = ticket.status === TicketStatus.Closed;
  const isEscalated = ticket.status === TicketStatus.Escalated;
  const canEscalate = !isClosed && !isEscalated;

  const messages: Message[] = [
    {
      id: `ticket-${ticket.id}`,
      content: ticket.content,
      fromAgent: false,
      createdAt: ticket.createdAt,
    },
    ...replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      contentHtml: reply.contentHtml,
      fromAgent: reply.fromAgent,
      createdAt: reply.createdAt,
    })),
  ];

  const uploadImage = async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    const token = readTocCredentials()?.token;
    const res = await fetch(
      tocPath(`/api/toc/tickets/${ticket.id}/attachments`),
      {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (res.status === 401) {
      notifyTocSessionExpired();
      throw new ApiClientError("Session expired", 401);
    }
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { url?: string };
      error?: string;
    } | null;
    if (!res.ok || !json?.ok || !json.data?.url) {
      throw new Error(
        typeof json?.error === "string" ? json.error : t.tickets.editor.imageFailed
      );
    }
    return json.data.url;
  };

  const sendDisabled =
    sending || draft.empty || (turnstileEnabled && !turnstileToken);

  const handleReply = async () => {
    if (sendDisabled) return;
    setSending(true);
    setReplyError("");
    try {
      const result = await tocApi.post<{ status: TicketStatus }>(
        `/api/toc/tickets/${ticket.id}/reply?lang=${encodeURIComponent(language)}`,
        {
          content: draft.text.trim(),
          contentHtml: draft.html,
          turnstileToken: turnstileToken ?? undefined,
        }
      );
      editorRef.current?.clear();
      if (
        ticket.status === TicketStatus.Replied &&
        result.status === TicketStatus.Processing
      ) {
        toast.success(t.toc.detail.replySent, {
          description: t.toc.detail.backInProcessing,
        });
      } else {
        toast.success(t.toc.detail.replySent);
      }
      onRefresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      setReplyError(
        error instanceof ApiClientError ? error.message : t.toc.detail.replyFailed
      );
    } finally {
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    setEscalating(true);
    try {
      await tocApi.post(`/api/toc/tickets/${ticket.id}/escalate`, {
        reason: escalateReason.trim() || undefined,
        turnstileToken: escalateTurnstileToken ?? undefined,
      });
      setEscalateOpen(false);
      setEscalateReason("");
      toast.success(t.toc.detail.escalateSuccess);
      onRefresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      toast.error(t.toc.detail.escalateFailed, {
        description:
          error instanceof ApiClientError ? error.message : undefined,
      });
    } finally {
      setEscalateTurnstileToken(null);
      escalateTurnstileRef.current?.reset();
      setEscalating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back link + escalate action */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
          {t.toc.detail.back}
        </Button>
        {canEscalate && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEscalateOpen(true)}
          >
            <ArrowUpRight className="size-4" />
            {t.toc.detail.escalate}
          </Button>
        )}
      </div>

      {/* Ticket header */}
      <Card className="py-4">
        <CardContent className="space-y-2 px-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-base font-semibold break-words">
              {ticket.subject}
            </h1>
            <TocStatusBadge status={ticket.status} className="mt-0.5 shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">#{ticket.id.slice(-8)}</span>
            <span className="mx-1.5">·</span>
            {t.toc.detail.created}{" "}
            <time dateTime={ticket.createdAt}>
              {formatDateTime(ticket.createdAt)}
            </time>
          </p>
        </CardContent>
      </Card>

      {/* Conversation */}
      <Card className="min-h-[32rem] py-4">
        <CardContent className="space-y-4 px-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.toc.detail.conversation}
          </p>
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                agentLabel={t.toc.detail.support}
                youLabel={t.toc.detail.you}
              />
            ))}
          </div>

          <Separator />

          {/* Composer */}
          {isClosed ? (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Lock className="size-4" />
              {t.toc.detail.ticketClosed}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border px-1 py-1">
                <RichTextEditor
                  ref={editorRef}
                  onChange={setDraft}
                  onSubmit={() => void handleReply()}
                  onUploadImage={uploadImage}
                  placeholder={t.toc.detail.replyPlaceholder}
                  disabled={sending}
                />
              </div>
              <TurnstileWidget widgetRef={turnstileRef} onToken={setTurnstileToken} />
              {replyError && (
                <p className="text-sm text-destructive">{replyError}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {t.toc.detail.replyShortcutHint}
                </p>
                <Button
                  onClick={handleReply}
                  disabled={sendDisabled}
                  size="sm"
                  className="ml-auto gap-1.5"
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t.toc.detail.sending}
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      {t.toc.detail.sendReply}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escalate confirm dialog */}
      <Dialog
        open={escalateOpen}
        onOpenChange={(open) => {
          setEscalateOpen(open);
          if (!open) {
            setEscalateTurnstileToken(null);
            escalateTurnstileRef.current?.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.toc.detail.escalateTitle}</DialogTitle>
            <DialogDescription>{t.toc.detail.escalateDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t.toc.detail.escalateReasonLabel}</Label>
            <Textarea
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder={t.toc.detail.escalateReasonPlaceholder}
              maxLength={2000}
              className="min-h-20"
            />
            <TurnstileWidget
              widgetRef={escalateTurnstileRef}
              onToken={setEscalateTurnstileToken}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEscalateOpen(false)}
              disabled={escalating}
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={
                escalating ||
                (turnstileEnabled && !escalateTurnstileToken)
              }
            >
              {escalating && <Loader2 className="size-4 animate-spin" />}
              {t.toc.detail.escalateConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
