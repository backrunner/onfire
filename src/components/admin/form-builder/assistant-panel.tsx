"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type DataMessagePartProps,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Bot, Check, Loader2, Send, Sparkles, Square } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiClientError, api } from "@/lib/api/client";
import type { FormSchema } from "@/lib/form-schema";
import { useI18n } from "@/lib/i18n";

interface FormBuilderAssistantProps {
  productId: string;
  defaultLanguage: string;
  schema: FormSchema;
  onApply: (schema: FormSchema) => void;
}

interface FormSchemaDraftData {
  id: string;
  schema: FormSchema;
}

interface DraftContextValue {
  appliedId: string | null;
  onApply: (schema: FormSchema, id: string) => void;
  applyLabel: string;
  appliedLabel: string;
  errorLabel: string;
}

const DraftContext = createContext<DraftContextValue | null>(null);

function FormSchemaDraft({
  data,
}: DataMessagePartProps<FormSchemaDraftData>) {
  const context = useContext(DraftContext);
  if (!context) return null;

  const applied = context.appliedId === data.id;
  return (
    <Button
      type="button"
      size="sm"
      variant={applied ? "secondary" : "outline"}
      className="mt-2 h-7 w-full text-xs"
      onClick={() => context.onApply(data.schema, data.id)}
      disabled={applied}
    >
      {applied ? <Check className="size-3" /> : <Sparkles className="size-3" />}
      {applied ? context.appliedLabel : context.applyLabel}
    </Button>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[92%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function MarkdownMessageText(_props: TextMessagePartProps) {
  return (
    <MarkdownTextPrimitive
      defer
      containerProps={{
        className:
          "space-y-1 break-words [&_a]:underline [&_code]:rounded [&_code]:bg-background/70 [&_code]:px-1 [&_code]:py-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-background/70 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-4",
      }}
    />
  );
}

function AssistantMessage() {
  const context = useContext(DraftContext);
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[92%] rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
        <MessagePrimitive.Content
          components={{
            Text: MarkdownMessageText,
            data: { by_name: { form_schema: FormSchemaDraft } },
          }}
        />
        <MessagePrimitive.Error>
          <p className="text-destructive" role="alert">{context?.errorLabel}</p>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

function EmptyThread({ label }: { label: string }) {
  return (
    <ThreadPrimitive.If empty>
      <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <Sparkles className="size-6 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </ThreadPrimitive.If>
  );
}

interface AssistantThreadProps {
  adapter: ChatModelAdapter;
  emptyLabel: string;
  placeholder: string;
  generatingLabel: string;
  sendLabel: string;
  stopLabel: string;
  applyLabel: string;
  appliedLabel: string;
  errorLabel: string;
  onApply: (schema: FormSchema) => void;
}

function AssistantThread({
  adapter,
  emptyLabel,
  placeholder,
  generatingLabel,
  sendLabel,
  stopLabel,
  applyLabel,
  appliedLabel,
  errorLabel,
  onApply,
}: AssistantThreadProps) {
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const runtime = useLocalRuntime(adapter);
  const handleApply = useMemo(
    () => (draft: FormSchema, id: string) => {
      onApply(draft);
      setAppliedId(id);
    },
    [onApply],
  );
  const draftContext = useMemo(
    () => ({ appliedId, onApply: handleApply, applyLabel, appliedLabel, errorLabel }),
    [appliedId, handleApply, applyLabel, appliedLabel, errorLabel],
  );
  const messageComponents = useMemo(
    () => ({ UserMessage, AssistantMessage }),
    [],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <DraftContext.Provider value={draftContext}>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            aria-label={emptyLabel}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          >
            <div className="space-y-3">
              <EmptyThread label={emptyLabel} />
              <ThreadPrimitive.Messages components={messageComponents} />
              <ThreadPrimitive.If running>
                <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{generatingLabel}</span>
                </div>
              </ThreadPrimitive.If>
            </div>
            <ThreadPrimitive.ViewportFooter className="sticky bottom-0 border-t bg-background p-3">
              <ComposerPrimitive.Root className="flex items-end gap-2">
                <ComposerPrimitive.Input
                  placeholder={placeholder}
                  rows={2}
                  submitMode="enter"
                  className="min-h-0 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                <ThreadPrimitive.If running>
                  <ComposerPrimitive.Cancel asChild>
                    <Button type="button" size="icon" variant="outline" aria-label={stopLabel}>
                      <Square className="size-3.5" />
                    </Button>
                  </ComposerPrimitive.Cancel>
                </ThreadPrimitive.If>
                <ThreadPrimitive.If running={false}>
                  <ComposerPrimitive.Send asChild>
                    <Button type="submit" size="icon" aria-label={sendLabel}>
                      <Send className="size-4" />
                    </Button>
                  </ComposerPrimitive.Send>
                </ThreadPrimitive.If>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </DraftContext.Provider>
    </AssistantRuntimeProvider>
  );
}

export function FormBuilderAssistant({
  productId,
  defaultLanguage,
  schema,
  onApply,
}: FormBuilderAssistantProps) {
  const { t, language } = useI18n();
  const a = t.formBuilder.assistant;
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async run({ messages, abortSignal }) {
        const latestUser = [...messages]
          .reverse()
          .find((message) => message.role === "user");
        const message = latestUser?.content
          .filter(
            (part): part is { type: "text"; text: string } =>
              part.type === "text",
          )
          .map((part) => part.text)
          .join("\n")
          .trim();

        if (!message) {
          return { content: [{ type: "text" as const, text: a.failed }] };
        }

        try {
          const result = await api.post<{ response: string; schema: FormSchema }>(
            "/api/tob/admin/ai/form-builder",
            {
              productId,
              defaultLanguage,
              interfaceLanguage: language,
              message,
              currentSchema: schemaRef.current,
            },
            { signal: abortSignal },
          );

          return {
            content: [
              { type: "text" as const, text: result.response },
              {
                type: "data" as const,
                name: "form_schema",
                data: {
                  id: `${Date.now()}-${Math.random()}`,
                  schema: result.schema,
                },
              },
            ],
          };
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          if (error instanceof ApiClientError && error.status === 503) {
            throw new Error(a.notConfigured);
          }
          if (error instanceof ApiClientError && error.status === 502) {
            throw new Error(a.failed);
          }
          throw error instanceof Error ? error : new Error(a.failed);
        }
      },
    }),
    [a.failed, a.notConfigured, defaultLanguage, language, productId],
  );

  return (
    <aside className="flex min-h-72 w-full min-w-0 flex-col border-t md:w-80 md:shrink-0 md:border-l md:border-t-0">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <Bot className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{a.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{a.hint}</p>
        </div>
      </div>
      <AssistantThread
        adapter={adapter}
        emptyLabel={a.empty}
        placeholder={a.placeholder}
        generatingLabel={a.generating}
        sendLabel={t.common.submit}
        stopLabel={a.stop}
        applyLabel={a.apply}
        appliedLabel={a.applied}
        errorLabel={a.failed}
        onApply={(draft) => onApply(draft)}
      />
    </aside>
  );
}
