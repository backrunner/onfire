/**
 * AI Chat Routes
 * Endpoints for AI agent chat with tool calling
 */

import { Elysia, t } from 'elysia';
import { streamText, generateText } from 'ai';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Bindings, WorkerSingleton } from '../core/types';
import { resolveContext } from '../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, aiChatMessages } from '@onfire/shared/drizzle/schema';
import { createAIClient, getModelId, AI_PROVIDERS } from '../services/ai/providers';
import { getAgentTools, type ToolContext } from '../services/ai/tools';

const ChatMessageBody = t.Object({
  message: t.String({ minLength: 1 }),
  sessionId: t.Optional(t.String())
});

export const createAIChatRoutes = (env: Bindings) =>
  new Elysia<'', false, WorkerSingleton>()
    // Send chat message (streaming response)
    .post(
      '/ai/chat',
      async ({ store, body, request }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        const ctx = await resolveContext(env, user);
        assertPermission(ctx, 'ticket.read');

        // Get AI config for agent task
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

        // Save user message
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

        // Get conversation history
        const history = await store.db
          .select()
          .from(aiChatMessages)
          .where(eq(aiChatMessages.sessionId, sessionId))
          .orderBy(aiChatMessages.createdAt)
          .limit(20)
          .all();

        // Build messages for AI
        const messages = history.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'tool',
          content: m.content
        }));

        // Create tool context
        const toolContext: ToolContext = {
          db: store.db,
          userId: user.id,
          tenantIds: ctx.tenantIds || []
        };

        // Get AI client and tools
        const client = createAIClient(config);
        const modelId = getModelId(config);
        const tools = getAgentTools(toolContext);

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

        try {
          // Check if streaming is requested
          const acceptHeader = request.headers.get('accept') || '';
          const wantsStream = acceptHeader.includes('text/event-stream');

          if (wantsStream && AI_PROVIDERS[config.provider]?.supportsStreaming) {
            // Streaming response
            const result = await streamText({
              model: client(modelId),
              system: systemPrompt,
              messages,
              tools,
              toolChoice: 'auto',
              maxSteps: 5
            });

            // Convert to SSE stream
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

                  // Save assistant message
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
            // Non-streaming response
            const result = await generateText({
              model: client(modelId),
              system: systemPrompt,
              messages,
              tools,
              toolChoice: 'auto',
              maxSteps: 5
            });

            const content = result.text;
            const toolCalls = result.toolCalls || [];
            const toolResults = result.toolResults || [];

            // Save assistant message
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
      },
      { body: ChatMessageBody }
    )

    // Get chat history
    .get('/ai/chat/history', async ({ store, query }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');

      const sessionId = query.sessionId as string | undefined;

      if (sessionId) {
        // Get specific session
        const messages = await store.db
          .select()
          .from(aiChatMessages)
          .where(eq(aiChatMessages.sessionId, sessionId))
          .orderBy(aiChatMessages.createdAt)
          .all();

        return {
          sessionId,
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
            toolResults: m.toolResults ? JSON.parse(m.toolResults) : null,
            createdAt: m.createdAt
          }))
        };
      } else {
        // Get recent sessions
        const sessions = await store.db
          .selectDistinct({ sessionId: aiChatMessages.sessionId })
          .from(aiChatMessages)
          .where(eq(aiChatMessages.userId, user.id))
          .orderBy(desc(aiChatMessages.createdAt))
          .limit(10)
          .all();

        return {
          sessions: sessions.map((s) => s.sessionId)
        };
      }
    })

    // Clear chat session
    .delete('/ai/chat/session/:sessionId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');

      await store.db
        .delete(aiChatMessages)
        .where(eq(aiChatMessages.sessionId, params.sessionId));

      return { success: true };
    });
