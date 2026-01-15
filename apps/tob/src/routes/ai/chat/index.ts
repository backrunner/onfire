import { streamText, generateText } from 'ai';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { assertPermission } from '@onfire/shared/rbac';
import { aiConfigs, aiChatMessages } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { createAIClient, getModelId, supportsStreaming } from '../../../services/ai/providers';
import type { AIProvider } from '@onfire/shared/drizzle/schema';
import { getAgentTools, type ToolContext } from '../../../services/ai/tools';
import { ok } from '../../../core/response';

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

export const aiChatRoutes = () => {
  const router = createRouter();

  // POST /ai/chat
  router.post('/ai/chat', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const userId = user.id;
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const body = await c.req.json<{ message: string; sessionId?: string }>();

    const config = await db
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

    await db.insert(aiChatMessages).values({
      id: nanoid(),
      userId,
      sessionId,
      role: 'user',
      content: body.message,
      toolCalls: null,
      toolResults: null,
      createdAt: now
    });

    const history = await db
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
      db,
      userId,
      tenantIds: ctx.tenantIds || []
    };

    const client = createAIClient(config);
    const modelId = getModelId(config);
    const tools = getAgentTools(toolContext);

    try {
      const acceptHeader = c.req.raw.headers.get('accept') || '';
      const wantsStream = acceptHeader.includes('text/event-stream');

      if (wantsStream && supportsStreaming(config.provider as AIProvider)) {
        const result = await streamText({
          model: client(modelId) as any,
          system: systemPrompt,
          messages,
          tools,
          toolChoice: 'auto'
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

              await db.insert(aiChatMessages).values({
                id: nanoid(),
                userId,
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
          toolChoice: 'auto'
        });

        const content = result.text;
        const toolCalls = result.toolCalls || [];
        const toolResults = result.toolResults || [];

        await db.insert(aiChatMessages).values({
          id: nanoid(),
          userId,
          sessionId,
          role: 'assistant',
          content,
          toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
          toolResults: toolResults.length > 0 ? JSON.stringify(toolResults) : null,
          createdAt: new Date().toISOString()
        });

        return c.json(ok({
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
        }));
      }
    } catch (error) {
      console.error('AI chat error:', error);
      return new Response(
        JSON.stringify({ error: 'AI chat failed', message: String(error) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });

  // GET /ai/chat/history
  router.get('/ai/chat/history', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const userId = user.id;
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const query = c.req.query();
    const sessionId = query.sessionId as string | undefined;

    if (sessionId) {
      const messages = await db
        .select()
        .from(aiChatMessages)
        .where(eq(aiChatMessages.sessionId, sessionId))
        .orderBy(aiChatMessages.createdAt)
        .all();

      return c.json(ok({
        sessionId,
        messages: messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
          toolResults: m.toolResults ? JSON.parse(m.toolResults) : null,
          createdAt: m.createdAt
        }))
      }));
    } else {
      const sessions = await db
        .selectDistinct({ sessionId: aiChatMessages.sessionId })
        .from(aiChatMessages)
        .where(eq(aiChatMessages.userId, userId))
        .orderBy(desc(aiChatMessages.createdAt))
        .limit(10)
        .all();

      return c.json(ok({ sessions: sessions.map((s: any) => s.sessionId) }));
    }
  });

  // DELETE /ai/chat/session/:sessionId
  router.delete('/ai/chat/session/:sessionId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const sessionId = c.req.param('sessionId');
    await db
      .delete(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId));

    return c.json(ok({ success: true }));
  });

  return router;
};
