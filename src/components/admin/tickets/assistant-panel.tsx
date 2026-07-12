"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { api, swrFetcher, qs, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AssistantPanelProps {
  ticketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side-sheet AI assistant chat, scoped to the ticket (session per ticket).
 * Grounded on ticket context + product knowledge base server-side.
 */
export function AssistantPanel({
  ticketId,
  open,
  onOpenChange,
}: AssistantPanelProps) {
  const { t } = useI18n();
  const a = t.tickets.assistant;
  const sessionId = `ticket-${ticketId}`;

  const {
    data: history,
    isLoading,
    mutate,
  } = useSWR<ChatMessage[]>(
    open ? `/api/tob/ai/assistant${qs({ sessionId })}` : null,
    swrFetcher
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history) setMessages(history);
  }, [history]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending, open]);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      await api.post(`/api/tob/ai/assistant`, {
        sessionId,
        message,
        ticketId,
      });
      await mutate();
    } catch (err) {
      setInput(message); // restore on failure
      if (err instanceof ApiClientError && err.status === 503) {
        toast.error(a.notConfigured);
      } else {
        toast.error(
          err instanceof Error && err.message ? err.message : a.failed
        );
      }
      await mutate();
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-muted-foreground" />
            {a.title}
          </SheetTitle>
          <SheetDescription className="text-xs">{a.hint}</SheetDescription>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading && messages.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="ml-auto h-10 w-2/3" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Sparkles className="size-7 text-muted-foreground/40" />
              <p className="max-w-[260px] text-sm text-muted-foreground">
                {a.empty}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={a.placeholder}
              rows={2}
              className="min-h-0 resize-none text-sm"
              disabled={sending}
            />
            <Button
              size="icon"
              className="size-9 shrink-0"
              onClick={send}
              disabled={!input.trim() || sending}
              aria-label={t.common.submit}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
