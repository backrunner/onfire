import { streamText, generateText } from 'ai';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { resolveContext } from '../../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, aiChatMessages } from '@onfire/shared/drizzle/schema';
import { createAIClient, getModelId, supportsStreaming } from '../../../services/ai/providers';
import type { AIProvider } from '@onfire/shared/drizzle/schema';
import { getAgentTools, type ToolContext } from '../../../services/ai/tools';
import type { Bindings } from '../../../core/types';

const systemPrompt = `You are an AI assistant for a customer support ticket system called OnFire.
You help support agents manage and respond to customer tickets efficiently.

Available tools:
- queryTickets: Search and filter tickets
- getTicketDetails: Get detailed ticket information
- generateReplyDraft: Generate a reply draft (user must confirm before sending)
- getTicketStatistics: Get ticket statistics and metrics
- analyzeTicketTrends: Analyze recent ticket trends and patterns

Guidelines:
- Be helpful and concise
- When asked about tickets, use the appropriate tools to gather information
- Always verify data before making claims
- If generating reply drafts, remind users they need to review and send manually
- Communicate in the same language as the user (Chinese or English)
- Format responses clearly using markdown when appropriate`;

export const sendChatMessage = async (
  env: Bindings,
  store: any,
  user: any,
  request: Request,
  body: { message: string; sessionId?: string }
) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  const config = await store.db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.taskType, 'agent'))
    .get();

  if (!config || !config.enabled) {
    return new Response(
      JSON.stringify({ error: 'AI agent not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessionId = body.sessionId || nanoid();
  const now = new Date().toISOString();

  await store.db.insert(aiChatMessages).values({
    id: nanoid(),
    userId: user.id,
    sessionId,
    role: 'user',
    content: body.message,
    toolCalls: null,
    toolResults: null,
    createdAt: now
  });

  const history = await store.db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.sessionId, sessionId))
    .orderBy(aiChatMessages.createdAt)
    .limit(20)
    .all();

  const messages = history.map((m: any) => ({
    role: m.role as 'user' | 'assistant' | 'tool',
    content: m.content
  }));

  const toolContext: ToolContext = {
    db: store.db,
    userId: user.id,
    tenantIds: ctx.tenantIds || []
  };

  const client = createAIClient(config);
  const modelId = getModelId(config);
  const tools = getAgentTools(toolContext);

  try {
    const acceptHeader = request.headers.get('accept') || '';
    const wantsStream = acceptHeader.includes('text/event-stream');

    if (wantsStream && supportsStreaming(config.provider as AIProvider)) {
      const result = await streamText({
        model: client(modelId) as any,
        system: systemPrompt,
        messages,
        tools,
        toolChoice: 'auto',
        maxSteps: 5
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let fullContent = '';
          const toolCallsUsed: any[] = [];

          try {
            for await (const chunk of result.textStream) {
              fullContent += chunk;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
              );
            }

            await store.db.insert(aiChatMessages).values({
              id: nanoid(),
              userId: user.id,
              sessionId,
              role: 'assistant',
              content: fullContent,
              toolCalls: toolCallsUsed.length > 0 ? JSON.stringify(toolCallsUsed) : null,
              toolResults: null,
              createdAt: new Date().toISOString()
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done', sessionId })}\n\n`)
            );
          } catch (error) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(error) })}\n\n`)
            );
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      const result = await generateText({
        model: client(modelId) as any,
        system: systemPrompt,
        messages,
        tools,
        toolChoice: 'auto',
        maxSteps: 5
      });

      const content = result.text;
      const toolCalls = result.toolCalls || [];
      const toolResults = result.toolResults || [];

      await store.db.insert(aiChatMessages).values({
        id: nanoid(),
        userId: user.id,
        sessionId,
        role: 'assistant',
        content,
        toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
        toolResults: toolResults.length > 0 ? JSON.stringify(toolResults) : null,
        createdAt: new Date().toISOString()
      });

      return {
        sessionId,
        message: content,
        toolCalls: toolCalls.map((tc: any) => ({
          name: tc.toolName,
          args: tc.args
        })),
        toolResults: toolResults.map((tr: any) => ({
          name: tr.toolName,
          result: tr.result
        }))
      };
    }
  } catch (error) {
    console.error('AI chat error:', error);
    return new Response(
      JSON.stringify({ error: 'AI chat failed', message: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const getChatHistory = async (env: Bindings, store: any, user: any, sessionId?: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  if (sessionId) {
    const messages = await store.db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(aiChatMessages.createdAt)
      .all();

    return {
      sessionId,
      messages: messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
        toolResults: m.toolResults ? JSON.parse(m.toolResults) : null,
        createdAt: m.createdAt
      }))
    };
  } else {
    const sessions = await store.db
      .selectDistinct({ sessionId: aiChatMessages.sessionId })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.userId, user.id))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(10)
      .all();

    return { sessions: sessions.map((s: any) => s.sessionId) };
  }
};

export const clearSession = async (env: Bindings, store: any, user: any, sessionId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  await store.db
    .delete(aiChatMessages)
    .where(eq(aiChatMessages.sessionId, sessionId));

  return { success: true };
};
