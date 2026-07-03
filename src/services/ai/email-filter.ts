/**
 * AI Email Filter
 * Classifies inbound emails before ticket creation: spam / non-support
 * content is filtered out according to the product's strictness setting.
 */

import type { Database } from "@/lib/db";
import type { AIFilterStrictness } from "@/drizzle/schema";
import { getAIProvider } from "./config";

export interface EmailClassification {
  isSupportRequest: boolean;
  isSpam: boolean;
  confidence: number;
  reason: string;
}

const FILTER_PROMPT = `You are an email classifier for a customer support system. Classify the email below.

Respond in JSON format only:
{
  "isSupportRequest": true/false,  // is this a genuine customer support request?
  "isSpam": true/false,            // is this spam, marketing, phishing or automated noise?
  "confidence": 0.0-1.0,           // your confidence in this classification
  "reason": "one short sentence"
}`;

/** Minimum confidence required to REJECT an email, per strictness level. */
const REJECT_CONFIDENCE: Record<AIFilterStrictness, number> = {
  low: 0.9,
  medium: 0.75,
  high: 0.5,
};

export async function classifyInboundEmail(
  db: Database,
  input: { fromEmail: string; subject: string; content: string }
): Promise<EmailClassification | null> {
  const provider = await getAIProvider(db, "prescreening");
  if (!provider) return null;

  try {
    const result = await provider.complete({
      messages: [
        { role: "system", content: FILTER_PROMPT },
        {
          role: "user",
          content: `From: ${input.fromEmail}\nSubject: ${input.subject}\n\n${input.content.slice(0, 4000)}`,
        },
      ],
      temperature: 0,
      maxTokens: 256,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<EmailClassification>;
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
