/**
 * AI Email Filter
 * Classifies inbound emails before ticket creation: spam / non-support
 * content is filtered out according to the product's strictness setting.
 */

import type { Database } from "@/lib/db";
import type { AIFilterStrictness } from "@/drizzle/schema";
import { getAIProvider } from "./config";
import { z } from "zod";

const verdictSchema = z.object({
  isSupportRequest: z.boolean(),
  isSpam: z.boolean(),
  confidence: z.number().min(0).max(1),
}).passthrough();

function parseClassification(content: string): Partial<EmailClassification> {
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Failed to parse email classification as JSON");
  return verdictSchema.parse(JSON.parse(json));
}

export interface EmailClassification {
  isSupportRequest: boolean;
  isSpam: boolean;
  confidence: number;
  reason: string;
  ticketTypeId?: string;
  typeConfidence: number;
  issues: string[];
  keywords: string[];
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "low" | "medium" | "high";
  summary?: string;
}

export interface EmailTicketTypeCandidate {
  id: string;
  path: string;
  description?: string | null;
}

const FILTER_PROMPT = `You are the prescreening classifier for a customer support system. Analyze the email, reject spam/non-support content, and select the best ticket type from the provided candidates.

Respond in JSON format only:
{
  "isSupportRequest": true/false,  // is this a genuine customer support request?
  "isSpam": true/false,            // is this spam, marketing, phishing or automated noise?
  "confidence": 0.0-1.0,           // confidence in the spam/support decision
  "reason": "one short sentence",
  "ticketTypeId": "one exact candidate id or null",
  "typeConfidence": 0.0-1.0,
  "issues": ["main issue"],
  "keywords": ["keyword"],
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high",
  "summary": "one sentence"
}`;

/** Minimum confidence required to REJECT an email, per strictness level. */
const REJECT_CONFIDENCE: Record<AIFilterStrictness, number> = {
  low: 0.9,
  medium: 0.75,
  high: 0.5,
};

export async function classifyInboundEmail(
  db: Database,
  input: { fromEmail: string; subject: string; content: string },
  candidates: EmailTicketTypeCandidate[] = [],
  context: { tenantId?: string | null; productId?: string | null } = {}
): Promise<EmailClassification | null> {
  try {
    const provider = await getAIProvider(db, "prescreening", context);
    if (!provider) return null;
    const result = await provider.complete({
      messages: [
        { role: "system", content: FILTER_PROMPT },
        {
          role: "user",
          content: `Ticket type candidates:\n${JSON.stringify(candidates)}\n\nFrom: ${input.fromEmail}\nSubject: ${input.subject}\n\n${input.content.slice(0, 8000)}`,
        },
      ],
      temperature: 0,
      maxTokens: 768,
      validateResult: (result) => { parseClassification(result.content); },
    });

    const parsed = parseClassification(result.content);
    if (
      typeof parsed.isSupportRequest !== "boolean" ||
      typeof parsed.isSpam !== "boolean"
    ) {
      return null;
    }
    return {
      isSupportRequest: parsed.isSupportRequest,
      isSpam: parsed.isSpam,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      ticketTypeId:
        typeof parsed.ticketTypeId === "string" ? parsed.ticketTypeId : undefined,
      typeConfidence:
        typeof parsed.typeConfidence === "number"
          ? Math.min(1, Math.max(0, parsed.typeConfidence))
          : 0,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.filter((value): value is string => typeof value === "string")
        : [],
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((value): value is string => typeof value === "string")
        : [],
      sentiment:
        parsed.sentiment === "positive" || parsed.sentiment === "neutral" || parsed.sentiment === "negative"
          ? parsed.sentiment
          : undefined,
      urgency:
        parsed.urgency === "low" || parsed.urgency === "medium" || parsed.urgency === "high"
          ? parsed.urgency
          : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    };
  } catch (error) {
    // AI filtering is best-effort: a provider outage must never block inbound mail.
    console.error("Email classification failed:", error);
    return null;
  }
}

/**
 * Decide whether a classified email should be rejected, honoring the
 * configured strictness (stricter = lower confidence needed to reject).
 */
export function shouldRejectEmail(
  classification: EmailClassification,
  strictness: AIFilterStrictness
): boolean {
  const threshold = REJECT_CONFIDENCE[strictness] ?? REJECT_CONFIDENCE.medium;
  if (classification.isSpam && classification.confidence >= threshold) {
    return true;
  }
  return (
    !classification.isSupportRequest &&
    classification.confidence >= threshold
  );
}
