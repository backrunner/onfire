"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { api } from "@/lib/api/client";
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
  onSent: () => void;
}

/** Bottom composer: reply or internal note, submits on Cmd/Ctrl+Enter. */
export function ReplyComposer({ ticketId, closed, onSent }: ReplyComposerProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  // Closed tickets only accept internal notes (backend rule).
  const effectiveInternal = closed ? true : internal;
  const canSend = content.trim().length > 0 && !sending;

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

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border bg-card p-3",
        effectiveInternal && "border-amber-500/40 bg-amber-500/5"
      )}
    >
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
