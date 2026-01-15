import { useState, useRef, useEffect } from 'react';
import { Button, Input, ScrollArea, Badge } from '@onfire/ui';
import {
  Bot,
  Send,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  MessageSquare,
  Loader2,
  Sparkles,
  Wrench
} from 'lucide-react';
import {
  sendAIChatMessage,
  sendAIChatMessageStream,
  getAIChatHistory,
  deleteAIChatSession,
  type AIChatMessage
} from '../../api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  pending?: boolean;
}

export function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (open && !minimized) {
      inputRef.current?.focus();
    }
  }, [open, minimized]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Add pending assistant message
    const pendingId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: 'assistant', content: '', pending: true }
    ]);

    try {
      // Try streaming first
      setStreaming(true);
      let streamedContent = '';
      let finalSessionId = sessionId;

      await sendAIChatMessageStream(
        { message: userMessage.content, sessionId: sessionId || undefined },
        (chunk) => {
          if (chunk.type === 'text' && chunk.content) {
            streamedContent += chunk.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pendingId ? { ...m, content: streamedContent } : m
              )
            );
          } else if (chunk.type === 'done' && chunk.sessionId) {
            finalSessionId = chunk.sessionId;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.message || 'Streaming error');
          }
        }
      );

      if (finalSessionId) {
        setSessionId(finalSessionId);
      }

      // Mark as complete
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId ? { ...m, pending: false } : m
        )
      );
    } catch (streamError) {
      // Fallback to non-streaming
      try {
        setStreaming(false);
        const response = await sendAIChatMessage({
          message: userMessage.content,
          sessionId: sessionId || undefined
        });

        setSessionId(response.sessionId);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  content: response.message,
                  toolCalls: response.toolCalls,
                  toolResults: response.toolResults,
                  pending: false
                }
              : m
          )
        );
      } catch (error) {
        console.error('Chat error:', error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? { ...m, content: '发送失败，请重试', pending: false }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleClearSession = async () => {
    if (sessionId) {
      try {
        await deleteAIChatSession(sessionId);
      } catch {}
    }
    setMessages([]);
    setSessionId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Closed state - just show the floating button
  if (!open) {
    return (
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  // Minimized state
  if (minimized) {
    return (
      <div
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-lg cursor-pointer"
        onClick={() => setMinimized(false)}
      >
        <Bot className="h-5 w-5" />
        <span className="text-sm font-medium">AI 助手</span>
        {messages.length > 0 && (
          <Badge variant="secondary" size="sm">
            {messages.length}
          </Badge>
        )}
      </div>
    );
  }

  // Full chat panel
  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[600px] flex flex-col rounded-lg border border-border bg-card shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium">AI 助手</span>
          {sessionId && (
            <Badge variant="secondary" size="sm">
              会话中
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={handleClearSession}
            title="清空会话"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => setMinimized(true)}
            title="最小化"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => setOpen(false)}
            title="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 max-h-[400px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Sparkles className="mb-2 h-8 w-8" />
            <p className="text-sm font-medium">AI 助手</p>
            <p className="text-xs mt-1">
              我可以帮你查询工单、生成回复、<br />分析数据等
            </p>
            <div className="mt-4 space-y-1 text-xs">
              <p className="text-muted-foreground">试试这些问题：</p>
              <button
                className="block w-full text-left px-3 py-1.5 rounded-md hover:bg-muted"
                onClick={() => setInput('今天有多少新工单？')}
              >
                "今天有多少新工单？"
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 rounded-md hover:bg-muted"
                onClick={() => setInput('最近一周的工单趋势如何？')}
              >
                "最近一周的工单趋势如何？"
              </button>
              <button
                className="block w-full text-left px-3 py-1.5 rounded-md hover:bg-muted"
                onClick={() => setInput('查找所有高优先级工单')}
              >
                "查找所有高优先级工单"
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.pending ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">
                        {streaming ? '正在回复...' : '思考中...'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Wrench className="h-3 w-3" />
                            <span>使用了工具</span>
                          </div>
                          {message.toolCalls.map((tc, i) => (
                            <Badge key={i} variant="secondary" size="sm" className="mt-1 mr-1">
                              {tc.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={loading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
