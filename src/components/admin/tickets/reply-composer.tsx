"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface ReplyComposerProps {
  ticketId: string;
  /** Replying is disabled for closed tickets, but internal notes stay allowed. */
  closed: boolean;
  /** Previously generated AI suggestion stored on the ticket, if any. */
  suggestion?: string | null;
  onSent: () => void;
}

/** Bottom composer: reply or internal note, submits on Cmd/Ctrl+Enter. */
export function ReplyComposer({
  ticketId,
  closed,
  suggestion,
  onSent,
}: ReplyComposerProps) {
  const { t, language } = useI18n();
  const [content, setContent] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(
    suggestion ?? null
  );
  const [aiDismissed, setAiDismissed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Closed tickets only accept internal notes (backend rule).
  const effectiveInternal = closed ? true : internal;
  const canSend = content.trim().length > 0 && !sending;
  const showSuggestion = Boolean(aiSuggestion) && !aiDismissed && !closed;

  const send = async () => {
    if (!canSend) return;
    const body = { content: content.trim(), internal: effectiveInternal };
    setSending(true);
    setContent(""); // optimistic clear
    try {
      await api.post(`/api/tob/tickets/${ticketId}`, body);
      toast.success(
        effectiveInternal ? t.tickets.actions.noteSaved : t.tickets.actions.replySent
      );
      onSent();
    } catch (err) {
      setContent(body.content); // restore on failure
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const generateSuggestion = async () => {
    setAiLoading(true);
    try {
      const result = await api.post<{ suggestedReply: string }>(
        `/api/tob/tickets/${ticketId}/prereply`,
        { language }
      );
      setAiSuggestion(result.suggestedReply);
      setAiDismissed(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 503) {
        toast.error(t.tickets.actions.aiNotConfigured);
      } else {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t.tickets.actions.aiSuggestFailed
        );
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-card p-3",
        effectiveInternal && "border-amber-500/40 bg-amber-500/5"
      )}
    >
      {showSuggestion && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {t.tickets.actions.aiSuggestTitle}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setContent(aiSuggestion ?? "");
                  setAiDismissed(true);
                }}
              >
                {t.tickets.actions.aiUse}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground"
                onClick={() => setAiDismissed(true)}
                aria-label={t.tickets.actions.aiDismiss}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground/90">
            {aiSuggestion}
          </p>
        </div>
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={
          effectiveInternal
            ? t.tickets.detail.internalNote
            : t.tickets.actions.replyPlaceholder
        }
        rows={3}
        disabled={sending}
        className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`internal-${ticketId}`}
            checked={effectiveInternal}
            onCheckedChange={setInternal}
            disabled={closed || sending}
            className="scale-90"
          />
          <Label
            htmlFor={`internal-${ticketId}`}
            className="text-xs text-muted-foreground"
          >
            {t.tickets.detail.internalNote}
          </Label>
          {!closed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={generateSuggestion}
              disabled={aiLoading || sending}
            >
              {aiLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {t.tickets.actions.aiSuggest}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {t.tickets.actions.replyHint}
          </span>
          <Button size="sm" className="h-8" onClick={send} disabled={!canSend}>
            <Send />
            {t.tickets.actions.sendReply}
          </Button>
        </div>
      </div>
    </div>
  );
}
