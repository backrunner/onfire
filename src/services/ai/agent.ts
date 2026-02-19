/**
 * AI Agent Service
 * Provides conversational AI assistance for support agents
 */

import type { Database } from "@/lib/db";
import { aiChatMessages, tickets, productKnowledge, replies } from "@/drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAIProvider } from "./config";
import type { AIMessage } from "./providers";

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
  const provider = await getAIProvider(db, "agent");
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
  if (options.ticketId) {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, options.ticketId),
    });

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
        .where(eq(replies.ticketId, options.ticketId))
        .orderBy(desc(replies.createdAt))
        .limit(3);

      if (ticketReplies.length > 0) {
        contextInfo += "\n\nRecent Replies:\n" +
          ticketReplies
            .reverse()
            .map((r) => `- ${r.senderId ? "Agent" : "Customer"}: ${r.content.substring(0, 200)}`)
            .join("\n");
      }

      // Get relevant knowledge
      const knowledge = await db
        .select()
        .from(productKnowledge)
        .where(eq(productKnowledge.productId, ticket.productId))
        .limit(3);

      if (knowledge.length > 0) {
        contextInfo += "\n\nRelevant Knowledge:\n" +
          knowledge.map((k) => `- ${k.title}: ${k.content.substring(0, 200)}`).join("\n");
      }
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

  await db.insert(aiChatMessages).values({
    id: userMessageId,
    userId: options.userId,
    sessionId: options.sessionId,
    role: "user",
    content: options.message,
    createdAt: now,
  });

  try {
    const result = await provider.complete({
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    // Save assistant response
    const assistantMessageId = crypto.randomUUID();
    await db.insert(aiChatMessages).values({
      id: assistantMessageId,
      userId: options.userId,
      sessionId: options.sessionId,
      role: "assistant",
      content: result.content,
      createdAt: new Date().toISOString(),
    });

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
  return db
    .select()
    .from(aiChatMessages)
    .where(
      and(
        eq(aiChatMessages.userId, userId),
        eq(aiChatMessages.sessionId, sessionId)
      )
    )
    .orderBy(aiChatMessages.createdAt)
    .limit(limit);
}

export async function clearChatSession(
  db: Database,
  userId: string,
  sessionId: string
): Promise<void> {
  // Note: In production, you might want to soft delete or archive
  // For now, we'll just mark the session as cleared by not deleting
  console.log(`Chat session ${sessionId} for user ${userId} cleared`);
}
