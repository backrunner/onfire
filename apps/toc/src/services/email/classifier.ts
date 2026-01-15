/**
 * Email Classification Service
 * Uses AI to classify inbound emails as support requests or spam/junk
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@onfire/shared/drizzle/client';
import { aiConfigs, productKnowledge } from '@onfire/shared/drizzle/schema';
import type { AIFilterStrictness } from '@onfire/shared/drizzle/schema';

export interface ClassificationResult {
  classification: 'SUPPORT_REQUEST' | 'SPAM' | 'AUTO_REPLY' | 'MARKETING' | 'PERSONAL' | 'UNCLEAR';
  isSupport: boolean;
  confidence: number;
  category?: string;
  reasoning: string;
  suggestedAction: 'create_ticket' | 'ignore' | 'manual_review';
}

interface ClassifyEmailOptions {
  subject: string;
  body: string;
  fromEmail: string;
  productId: string;
  strictness?: AIFilterStrictness;
}

/**
 * Classify an inbound email using AI
 */
export async function classifyInboundEmail(
  db: Db,
  options: ClassifyEmailOptions
): Promise<ClassificationResult> {
  const { subject, body, fromEmail, productId, strictness = 'medium' } = options;

  // Get AI config for prescreening
  const aiConfig = await db.query.aiConfigs.findFirst({
    where: eq(aiConfigs.taskType, 'prescreening')
  });

  if (!aiConfig || !aiConfig.enabled) {
    // No AI config - default to creating ticket (conservative approach)
    return {
      classification: 'SUPPORT_REQUEST',
      isSupport: true,
      confidence: 0.5,
      reasoning: 'AI classification not available - defaulting to support request',
      suggestedAction: 'create_ticket'
    };
  }

  // Get product knowledge for context
  const knowledge = await db.select().from(productKnowledge)
    .where(eq(productKnowledge.productId, productId))
    .limit(10);

  const knowledgeContext = knowledge.length > 0
    ? knowledge.map(k => `${k.title}: ${k.content.substring(0, 200)}`).join('\n')
    : 'No product knowledge available.';

  // Build classification prompt
  const systemPrompt = buildClassificationPrompt(knowledgeContext, strictness);
  const userPrompt = `
Subject: ${subject || '(no subject)'}
From: ${fromEmail}

Body:
${body.substring(0, 2000)}
`;

  try {
    // Call AI provider
    const result = await callAIProvider(aiConfig, systemPrompt, userPrompt);
    return parseClassificationResult(result, strictness);
  } catch (error) {
    console.error('AI classification failed:', error);
    // On error, default based on strictness
    return getDefaultClassification(strictness);
  }
}

function buildClassificationPrompt(knowledgeContext: string, strictness: AIFilterStrictness): string {
  const strictnessGuidance = {
    low: 'Be lenient - only filter obvious spam and auto-replies. When in doubt, classify as support.',
    medium: 'Use balanced judgment - filter clear spam, marketing, and auto-replies. Unclear cases should be reviewed.',
    high: 'Be strict - only allow clear support requests through. Filter anything that looks promotional or automated.'
  };

  return `You are an email classifier for a customer support system. Your task is to determine if an incoming email is a legitimate support request that should create a ticket.

Product Context:
${knowledgeContext}

Classification Guidelines (${strictness} strictness):
${strictnessGuidance[strictness]}

Classify the email into one of these categories:
1. SUPPORT_REQUEST - A genuine customer support inquiry about the product
2. SPAM - Unsolicited commercial email, phishing, or malicious content
3. AUTO_REPLY - Automated responses (out-of-office, delivery notifications, bounce messages)
4. MARKETING - Marketing emails, newsletters, promotions, sales pitches
5. PERSONAL - Personal communication not related to support
6. UNCLEAR - Cannot determine with confidence

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "classification": "SUPPORT_REQUEST" | "SPAM" | "AUTO_REPLY" | "MARKETING" | "PERSONAL" | "UNCLEAR",
  "isSupport": boolean,
  "confidence": 0.0-1.0,
  "category": "optional category if support request (e.g., 'billing', 'technical', 'account')",
  "reasoning": "brief explanation (1-2 sentences)",
  "suggestedAction": "create_ticket" | "ignore" | "manual_review"
}`;
}

async function callAIProvider(
  config: { provider: string; model: string; apiKey: string; baseUrl?: string | null },
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const { provider, model, apiKey, baseUrl } = config;

  let url: string;
  let headers: Record<string, string>;
  let body: any;

  switch (provider) {
    case 'openai':
      url = baseUrl || 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      };
      break;

    case 'anthropic':
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      };
      body = {
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      };
      break;

    default:
      // Default to OpenAI-compatible API
      url = baseUrl || 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;

  // Extract content based on provider
  if (provider === 'anthropic') {
    return data.content?.[0]?.text || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

function parseClassificationResult(aiResponse: string, strictness: AIFilterStrictness): ClassificationResult {
  try {
    // Try to parse JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    const validClassifications = ['SUPPORT_REQUEST', 'SPAM', 'AUTO_REPLY', 'MARKETING', 'PERSONAL', 'UNCLEAR'];
    const classification = validClassifications.includes(parsed.classification)
      ? parsed.classification
      : 'UNCLEAR';

    const validActions = ['create_ticket', 'ignore', 'manual_review'];
    const suggestedAction = validActions.includes(parsed.suggestedAction)
      ? parsed.suggestedAction
      : (classification === 'SUPPORT_REQUEST' ? 'create_ticket' : 'ignore');

    return {
      classification,
      isSupport: parsed.isSupport ?? (classification === 'SUPPORT_REQUEST'),
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      category: parsed.category,
      reasoning: parsed.reasoning || 'No reasoning provided',
      suggestedAction
    };
  } catch (error) {
    console.error('Failed to parse AI response:', error, aiResponse);
    return getDefaultClassification(strictness);
  }
}

function getDefaultClassification(strictness: AIFilterStrictness): ClassificationResult {
  // Default behavior based on strictness
  if (strictness === 'low') {
    return {
      classification: 'SUPPORT_REQUEST',
      isSupport: true,
      confidence: 0.5,
      reasoning: 'Classification failed - defaulting to support (low strictness)',
      suggestedAction: 'create_ticket'
    };
  } else if (strictness === 'high') {
    return {
      classification: 'UNCLEAR',
      isSupport: false,
      confidence: 0.5,
      reasoning: 'Classification failed - requires manual review (high strictness)',
      suggestedAction: 'manual_review'
    };
  } else {
    return {
      classification: 'UNCLEAR',
      isSupport: false,
      confidence: 0.5,
      reasoning: 'Classification failed - requires manual review',
      suggestedAction: 'manual_review'
    };
  }
}
