/**
 * AI Agent Service
 * Provides conversational AI assistance for support agents
 */

import type { Database } from "@/lib/db";
import { aiChatMessages, tickets, replies } from "@/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAIProvider } from "./config";
import { findRelevantKnowledge } from "./embedding";
import type { AIMessage } from "./providers";
import type { AuthedContext } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { badRequest, notFound } from "@/lib/api/response";

/** The dashboard uses one conversation per ticket; never mix ticket scopes. */
export async function assertAgentSessionAccess(
  ctx: AuthedContext,
  sessionId: string,
  ticketId?: string,
): Promise<string> {
  if (!sessionId.startsWith("ticket-") || sessionId.length <= 7) {
    throw badRequest("AI conversations require a ticket session");
  }
  const sessionTicketId = sessionId.slice(7);
  if (ticketId && ticketId !== sessionTicketId) {
    throw badRequest("AI session does not match the ticket");
  }
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, sessionTicketId),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);
  return ticket.id;
}

export interface AgentChatOptions {
  userId: string;
  sessionId: string;
  message: string;
  ticketId?: string;
}

export interface AgentChatResult {
  response: string;
  messageId: string;
}

const AGENT_SYSTEM_PROMPT = `You are an AI assistant helping customer support agents. You have access to:
- Ticket information and history
- Product knowledge base
- Previous conversation context

Your role is to:
1. Help agents understand customer issues
2. Suggest solutions based on knowledge base
3. Draft reply templates
4. Provide relevant information quickly

Be concise and helpful. Focus on actionable information.`;

export async function chatWithAgent(
  db: Database,
  options: AgentChatOptions
): Promise<AgentChatResult | null> {
  const ticket = options.ticketId
    ? await db.query.tickets.findFirst({
        where: eq(tickets.id, options.ticketId),
      })
    : null;
  const provider = await getAIProvider(db, "agent", {
    tenantId: ticket?.tenantId,
    productId: ticket?.productId,
  });
  if (!provider) {
    console.log("Agent AI not configured");
    return null;
  }

  // Get previous messages in this session
  const previousMessages = await db
    .select()
    .from(aiChatMessages)
    .where(
      and(
        eq(aiChatMessages.userId, options.userId),
        eq(aiChatMessages.sessionId, options.sessionId)
      )
    )
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(10);

  // Build context
  let contextInfo = "";

  // Add ticket context if provided
  if (ticket) {
      contextInfo += `\n\nCurrent Ticket Context:
- ID: ${ticket.id}
- Subject: ${ticket.subject}
- Status: ${ticket.status}
- Priority: ${ticket.priority}
- Customer: ${ticket.customerEmail}
- Content: ${ticket.content.substring(0, 500)}`;

      // Get ticket replies
      const ticketReplies = await db
        .select()
        .from(replies)
        .where(eq(replies.ticketId, ticket.id))
        .orderBy(desc(replies.createdAt))
        .limit(3);

      if (ticketReplies.length > 0) {
        contextInfo += "\n\nRecent Replies:\n" +
          ticketReplies
            .reverse()
            .map((r) => `- ${r.internal ? "Internal note (never disclose to the customer)" : r.senderId ? "Agent" : "Customer"}: ${r.content.substring(0, 200)}`)
            .join("\n");
      }

      // Get relevant knowledge
      const knowledge = await findRelevantKnowledge(
        db,
        ticket.productId,
        `${options.message}\n\n${ticket.subject}\n${ticket.content}`,
        3
      );

      if (knowledge.length > 0) {
        contextInfo += "\n\nRelevant Knowledge:\n" +
          knowledge.map((k) => `- ${k.title}: ${k.content.substring(0, 200)}`).join("\n");
      }
  }

  // Build messages array
  const messages: AIMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT + contextInfo },
  ];

  // Add previous messages (reversed to chronological order)
  for (const msg of previousMessages.reverse()) {
    messages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // Add current message
  messages.push({ role: "user", content: options.message });

  // Save user message
  const userMessageId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const result = await provider.complete({
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    // Save assistant response
    const assistantMessageId = crypto.randomUUID();
    await db.insert(aiChatMessages).values([{
      id: userMessageId,
      userId: options.userId,
      sessionId: options.sessionId,
      role: "user",
      content: options.message,
      createdAt: now,
    }, {
      id: assistantMessageId,
      userId: options.userId,
      sessionId: options.sessionId,
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
    }]);

    return {
      response: result.content,
      messageId: assistantMessageId,
    };
  } catch (error) {
    console.error("Agent chat failed:", error);
    throw error;
  }
}

export async function getChatHistory(
  db: Database,
  userId: string,
  sessionId: string,
  limit = 50
) {
  const messages = await db
    .select()
    .from(aiChatMessages)
    .where(
      and(
        eq(aiChatMessages.userId, userId),
        eq(aiChatMessages.sessionId, sessionId)
      )
    )
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(limit);
  return messages.reverse();
}
