/**
 * AI Ticket Screening Service
 * Analyzes tickets for validity, extracts issues, suggests tags, and generates pre-replies
 */

import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import type { Db } from '@onfire/shared/drizzle/client';
import { aiConfigs, productKnowledge, tickets, ticketTags } from '@onfire/shared/drizzle/schema';
import { createAIClient, getModelId } from './providers';
import { nanoid } from 'nanoid';

export interface ScreeningResult {
  validity: 'valid' | 'invalid' | 'spam' | 'rant';
  confidence: number;
  extractedIssues: string[];
  suggestedTags: string[];
  keywords: string[];
  suggestedReply?: string;
  autoAction?: 'close' | 'reply' | null;
  reasoning: string;
}

export interface PreReplyResult {
  reply: string;
  confidence: number;
  sourcesUsed: string[];
}

/**
 * Get the AI configuration for a specific task type
 */
export async function getAIConfig(db: Db, taskType: 'agent' | 'prescreening' | 'prereply' | 'embedding') {
  const config = await db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.taskType, taskType))
    .get();

  if (!config || !config.enabled) {
    return null;
  }

  return config;
}

/**
 * Get product knowledge for context
 */
export async function getProductKnowledge(db: Db, productId: string, limit = 10) {
  const knowledge = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId))
    .limit(limit)
    .all();

  return knowledge;
}

/**
 * Screen a ticket using AI
 */
export async function screenTicket(
  db: Db,
  ticketId: string
): Promise<ScreeningResult | null> {
  // Get the ticket
  const ticket = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  // Get AI config for prescreening
  const config = await getAIConfig(db, 'prescreening');
  if (!config) {
    console.log('No prescreening AI config found');
    return null;
  }

  // Get product knowledge for context
  const knowledge = await getProductKnowledge(db, ticket.productId);
  const knowledgeContext = knowledge
    .map((k) => `[${k.knowledgeType}] ${k.title}: ${k.content}`)
    .join('\n\n');

  // Build the prompt
  const systemPrompt = `You are an AI assistant that analyzes customer support tickets. Your task is to:
1. Determine if the ticket is valid, invalid, spam, or just a rant/complaint without actionable issues
2. Extract the main issues/problems mentioned
3. Suggest relevant tags for categorization
4. Extract keywords for search indexing
5. Determine if any automatic action should be taken (close invalid tickets, etc.)

Product Knowledge Context:
${knowledgeContext || 'No product knowledge available'}

Respond in JSON format with this structure:
{
  "validity": "valid" | "invalid" | "spam" | "rant",
  "confidence": 0.0-1.0,
  "extractedIssues": ["issue1", "issue2"],
  "suggestedTags": ["tag1", "tag2"],
  "keywords": ["keyword1", "keyword2"],
  "autoAction": null | "close" | "reply",
  "reasoning": "Brief explanation of your analysis"
}`;

  const userPrompt = `Analyze this support ticket:

Subject: ${ticket.subject}

Content:
${ticket.content}

Metadata:
${ticket.metadata ? JSON.stringify(JSON.parse(ticket.metadata), null, 2) : 'None'}`;

  try {
    const client = createAIClient(config);
    const modelId = getModelId(config);

    const result = await generateText({
      model: client(modelId) as any,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1000
    });

    // Parse the response
    const text = result.text.trim();
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    const parsed = JSON.parse(jsonStr) as ScreeningResult;

    // Update ticket with screening results
    await db
      .update(tickets)
      .set({
        aiScreeningStatus: 'completed',
        aiScreeningResult: JSON.stringify(parsed),
        aiExtractedIssues: JSON.stringify(parsed.extractedIssues),
        aiKeywords: JSON.stringify(parsed.keywords),
        updatedAt: new Date().toISOString()
      })
      .where(eq(tickets.id, ticketId));

    // Save suggested tags
    if (parsed.suggestedTags.length > 0) {
      const now = new Date().toISOString();
      await db
        .insert(ticketTags)
        .values(
          parsed.suggestedTags.map((tag) => ({
            id: nanoid(),
            ticketId,
            tag,
            source: 'ai' as const,
            confidence: parsed.confidence,
            createdAt: now
          }))
        )
        .onConflictDoNothing();
    }

    return parsed;
  } catch (error) {
    console.error('Screening failed:', error);

    // Update ticket with error status
    await db
      .update(tickets)
      .set({
        aiScreeningStatus: 'error',
        updatedAt: new Date().toISOString()
      })
      .where(eq(tickets.id, ticketId));

    return null;
  }
}

/**
 * Generate a pre-reply for a ticket using AI and knowledge base
 */
export async function generatePreReply(
  db: Db,
  ticketId: string
): Promise<PreReplyResult | null> {
  // Get the ticket
  const ticket = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  // Get AI config for prereply
  const config = await getAIConfig(db, 'prereply');
  if (!config) {
    console.log('No prereply AI config found');
    return null;
  }

  // Get product knowledge for context
  const knowledge = await getProductKnowledge(db, ticket.productId, 20);
  const knowledgeContext = knowledge
    .map((k) => `[${k.knowledgeType}] ${k.title}:\n${k.content}`)
    .join('\n\n---\n\n');

  // Get screening result if available
  const screeningResult = ticket.aiScreeningResult
    ? JSON.parse(ticket.aiScreeningResult) as ScreeningResult
    : null;

  const systemPrompt = `You are a helpful customer support assistant. Generate a professional, friendly reply to the customer's ticket.

Use the following product knowledge to inform your response:
${knowledgeContext || 'No specific product knowledge available'}

${screeningResult ? `
The ticket has been analyzed with the following issues identified:
${screeningResult.extractedIssues.join(', ')}
` : ''}

Guidelines:
- Be professional and empathetic
- Address the specific issues mentioned
- Provide helpful information from the knowledge base when relevant
- If you cannot fully resolve the issue, acknowledge it and explain next steps
- Keep the response concise but complete
- Use the customer's language style (Chinese or English)

Respond with only the reply text, no additional formatting.`;

  const userPrompt = `Generate a reply for this ticket:

Subject: ${ticket.subject}

Customer Message:
${ticket.content}`;

  try {
    const client = createAIClient(config);
    const modelId = getModelId(config);

    const result = await generateText({
      model: client(modelId) as any,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxOutputTokens: 1500
    });

    const reply = result.text.trim();
    const sourcesUsed = knowledge
      .filter((k) => reply.toLowerCase().includes(k.title.toLowerCase()))
      .map((k) => k.title);

    const preReplyResult: PreReplyResult = {
      reply,
      confidence: 0.8, // Could be calculated based on knowledge matches
      sourcesUsed
    };

    // Update ticket with suggested reply
    await db
      .update(tickets)
      .set({
        aiSuggestedReply: reply,
        updatedAt: new Date().toISOString()
      })
      .where(eq(tickets.id, ticketId));

    return preReplyResult;
  } catch (error) {
    console.error('Pre-reply generation failed:', error);
    return null;
  }
}

/**
 * Batch screen multiple tickets
 */
export async function batchScreenTickets(
  db: Db,
  ticketIds: string[]
): Promise<Map<string, ScreeningResult | null>> {
  const results = new Map<string, ScreeningResult | null>();

  for (const ticketId of ticketIds) {
    try {
      const result = await screenTicket(db, ticketId);
      results.set(ticketId, result);
    } catch (error) {
      console.error(`Failed to screen ticket ${ticketId}:`, error);
      results.set(ticketId, null);
    }
  }

  return results;
}
