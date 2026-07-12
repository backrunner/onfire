/**
 * AI Pre-reply Service
 * Generates suggested replies for support tickets
 */

import type { Database } from "@/lib/db";
import { tickets, replies } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getAIProvider } from "./config";
import { findRelevantKnowledge } from "./embedding";

export interface PrereplyOptions {
  ticketId: string;
  includeKnowledge?: boolean;
  tone?: "formal" | "friendly" | "professional";
  language?: "en" | "zh";
}

export interface PrereplyResult {
  suggestedReply: string;
  confidence: number;
  sources?: string[];
}

const PREREPLY_PROMPT = `You are a professional customer support agent. Generate a helpful reply to the following support ticket.

Guidelines:
- Be polite and empathetic
- Address all issues mentioned by the customer
- Provide clear and actionable solutions
- Keep the response concise but complete
- Use the provided knowledge base information if relevant

Tone: {{tone}}
Language: {{language}}

{{knowledge}}

Generate a reply that directly addresses the customer's concerns.`;

export async function generatePrereply(
  db: Database,
  options: PrereplyOptions
): Promise<PrereplyResult | null> {
  const provider = await getAIProvider(db, "prereply");
  if (!provider) {
    console.log("Prereply AI not configured");
    return null;
  }

  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, options.ticketId),
  });

  if (!ticket) {
    throw new Error(`Ticket not found: ${options.ticketId}`);
  }

  // Get previous replies for context
  const previousReplies = await db
    .select()
    .from(replies)
    .where(eq(replies.ticketId, options.ticketId))
    .orderBy(desc(replies.createdAt))
    .limit(5);

  // Get relevant knowledge if requested
  let knowledgeContext = "";
  const sources: string[] = [];

  if (options.includeKnowledge) {
    const knowledge = await findRelevantKnowledge(
      db,
      ticket.productId,
      `${ticket.subject}\n\n${ticket.content}`,
      5
    );

    if (knowledge.length > 0) {
      knowledgeContext = "\n\nRelevant Knowledge Base:\n" +
        knowledge.map((k) => {
          sources.push(k.title);
          return `- ${k.title}: ${k.content.substring(0, 500)}`;
        }).join("\n");
    }
  }

  // Build conversation context
  let conversationContext = `Subject: ${ticket.subject}\n\nCustomer's Message:\n${ticket.content}`;

  if (previousReplies.length > 0) {
    conversationContext += "\n\nPrevious Conversation:\n" +
      previousReplies
        .reverse()
        .map((r) => `${r.senderId ? "Agent" : "Customer"}: ${r.content.substring(0, 300)}`)
        .join("\n\n");
  }

  const systemPrompt = PREREPLY_PROMPT
    .replace("{{tone}}", options.tone || "professional")
    .replace("{{language}}", options.language === "zh" ? "Chinese" : "English")
    .replace("{{knowledge}}", knowledgeContext);

  try {
    const result = await provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: conversationContext },
      ],
      temperature: 0.7,
      maxTokens: 1024,
    });

    const suggestedReply = result.content.trim();

    // Update ticket with suggested reply
    await db
      .update(tickets)
      .set({
        aiSuggestedReply: suggestedReply,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tickets.id, options.ticketId));

    return {
      suggestedReply,
      confidence: 0.8,
      sources: sources.length > 0 ? sources : undefined,
    };
  } catch (error) {
    console.error("Failed to generate prereply:", error);
    throw error;
  }
}
