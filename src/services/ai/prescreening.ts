/**
 * AI Prescreening Service
 * Analyzes incoming tickets to extract issues, keywords, and classify content
 */

import type { Database } from "@/lib/db";
import { tickets } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { getAIProvider } from "./config";
import { z } from "zod";

const prescreeningSchema = z.object({
  issues: z.array(z.string()),
  keywords: z.array(z.string()),
  category: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  urgency: z.enum(["low", "medium", "high"]).optional(),
  summary: z.string().optional(),
});

function parsePrescreening(content: string): PrescreeningResult {
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Failed to parse AI response as JSON");
  return prescreeningSchema.parse(JSON.parse(json));
}

export interface PrescreeningResult {
  issues: string[];
  keywords: string[];
  category?: string;
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "low" | "medium" | "high";
  summary?: string;
}

const PRESCREENING_PROMPT = `You are a ticket analysis assistant. Analyze the following support ticket and extract:

1. **Issues**: List the main problems or questions the customer is facing (as an array of strings)
2. **Keywords**: Extract relevant keywords for search and categorization (as an array of strings)
3. **Category**: Suggest a category for this ticket (single string)
4. **Sentiment**: Determine the customer's sentiment (positive, neutral, or negative)
5. **Urgency**: Assess the urgency level (low, medium, or high)
6. **Summary**: Provide a brief one-sentence summary

Respond in JSON format only:
{
  "issues": ["issue1", "issue2"],
  "keywords": ["keyword1", "keyword2"],
  "category": "category name",
  "sentiment": "neutral",
  "urgency": "medium",
  "summary": "Brief summary"
}`;

export async function prescreenTicket(
  db: Database,
  ticketId: string
): Promise<PrescreeningResult | null> {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  try {
    const provider = await getAIProvider(db, "prescreening", {
      tenantId: ticket.tenantId,
      productId: ticket.productId,
    });
    if (!provider) return null;

    await db
      .update(tickets)
      .set({ aiScreeningStatus: "processing" })
      .where(eq(tickets.id, ticketId));

    const result = await provider.complete({
      messages: [
        { role: "system", content: PRESCREENING_PROMPT },
        {
          role: "user",
          content: `Subject: ${ticket.subject}\n\nContent:\n${ticket.content}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1024,
      validateResult: (result) => { parsePrescreening(result.content); },
    });

    // Parse JSON response
    const parsed = parsePrescreening(result.content);

    // Update ticket with results
    await db
      .update(tickets)
      .set({
        aiScreeningStatus: "completed",
        aiScreeningResult: JSON.stringify(parsed),
        aiExtractedIssues: JSON.stringify(parsed.issues || []),
        aiKeywords: JSON.stringify(parsed.keywords || []),
      })
      .where(eq(tickets.id, ticketId));

    return parsed;
  } catch (error) {
    await db
      .update(tickets)
      .set({
        aiScreeningStatus: "error",
        aiScreeningResult: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(tickets.id, ticketId));

    throw error;
  }
}
