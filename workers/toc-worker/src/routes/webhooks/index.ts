/**
 * Webhook Routes
 * Handles inbound email webhooks from various providers
 */
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createRouter } from '../../core/router';
import { emailConfigs, inboundEmails } from '@onfire/shared/drizzle/schema';
import { processInboundEmail } from '../../services/email/inbound';

// Maileroo webhook payload type
interface MailerooWebhookPayload {
  _id: string;
  message_id: string;
  domain: string;
  envelope_sender: string;
  recipients: string[];
  headers: Record<string, string[]>;
  body: {
    plaintext: string;
    stripped_plaintext: string;
    html: string;
    stripped_html: string;
  };
  attachments: Array<{
    filename: string;
    content_id: string;
    content_type: string;
    url: string;
    size: number;
  }> | null;
  spf_result: string;
  dkim_result: boolean;
  is_dmarc_aligned: boolean;
  is_spam: boolean;
  deletion_url: string;
  validation_url: string;
  processed_at: number;
}

// Generic inbound email webhook payload
interface GenericInboundEmailPayload {
  // Required fields
  from_email: string;
  to_email: string;
  subject: string;

  // Content (at least one required)
  body_plain?: string;
  body_html?: string;

  // Optional fields
  from_name?: string;
  message_id?: string;
  in_reply_to?: string;
  references?: string;

  // Optional security info
  spf_result?: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none';
  dkim_result?: boolean;
  is_spam?: boolean;

  // Optional metadata
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
    url?: string;
  }>;
}

/**
 * Verify webhook authentication using Bearer token or HMAC signature
 */
async function verifyWebhookAuth(
  request: Request,
  rawBody: string,
  secret: string
): Promise<{ valid: boolean; method?: 'bearer' | 'hmac' }> {
  // Check Bearer token
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === secret) {
      return { valid: true, method: 'bearer' };
    }
  }

  // Check HMAC signature
  const signatureHeader = request.headers.get('X-Webhook-Signature');
  if (signatureHeader?.startsWith('sha256=')) {
    const providedSignature = signatureHeader.slice(7);

    // Compute expected signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (providedSignature === expectedSignature) {
      return { valid: true, method: 'hmac' };
    }
  }

  return { valid: false };
}

export const webhookRoutes = () => {
  const router = createRouter();

  // POST /webhooks/maileroo - Maileroo inbound webhook
  router.post('/webhooks/maileroo', async (c) => {
    const db = c.get('db');

    let payload: MailerooWebhookPayload;
    try {
      payload = await c.req.json<MailerooWebhookPayload>();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    // Validate required fields
    if (!payload.message_id || !payload.recipients?.length || !payload.envelope_sender) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Get recipient email (first one)
    const toEmail = payload.recipients[0];

    // Find email config by inbound address
    const config = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.inboundAddress, toEmail)
    });

    if (!config) {
      // Try to find by domain match
      const domain = toEmail.split('@')[1];
      const allConfigs = await db.select().from(emailConfigs);
      const matchingConfig = allConfigs.find(c =>
        c.inboundAddress && c.inboundAddress.endsWith(`@${domain}`)
      );

      if (!matchingConfig) {
        console.log(`No email config found for recipient: ${toEmail}`);
        return c.json({ error: 'Unknown recipient', recipient: toEmail }, 404);
      }
    }

    const emailConfig = config || await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.inboundAddress, toEmail)
    });

    if (!emailConfig || !emailConfig.inboundEnabled) {
      return c.json({ error: 'Inbound email not enabled' }, 404);
    }

    // Parse sender name from headers
    const fromHeader = payload.headers['From']?.[0] || payload.envelope_sender;
    const fromName = parseFromName(fromHeader);

    // Log inbound email
    const inboundEmailId = nanoid();
    const now = new Date().toISOString();

    await db.insert(inboundEmails).values({
      id: inboundEmailId,
      productId: emailConfig.productId,
      messageId: payload.message_id,
      provider: 'maileroo',
      fromEmail: payload.envelope_sender,
      fromName,
      toEmail,
      subject: payload.headers['Subject']?.[0] || null,
      bodyPlain: payload.body.stripped_plaintext || payload.body.plaintext || null,
      bodyHtml: payload.body.stripped_html || payload.body.html || null,
      processingStatus: 'pending',
      filterResult: null,
      ticketId: null,
      replyId: null,
      errorMessage: null,
      spfResult: payload.spf_result,
      dkimResult: payload.dkim_result,
      isSpam: payload.is_spam,
      rawPayload: JSON.stringify(payload),
      createdAt: now,
      processedAt: null
    });

    // Process asynchronously using waitUntil
    c.executionCtx.waitUntil(
      processInboundEmail(db, inboundEmailId)
        .then(result => {
          console.log(`Processed inbound email ${inboundEmailId}:`, result);
        })
        .catch(error => {
          console.error(`Failed to process inbound email ${inboundEmailId}:`, error);
        })
    );

    return c.json({
      ok: true,
      id: inboundEmailId,
      message: 'Email received and queued for processing'
    });
  });

  // POST /webhooks/maileroo/validate - Validate webhook (optional endpoint for testing)
  router.post('/webhooks/maileroo/validate', async (c) => {
    const body = await c.req.json<{ validation_url?: string }>();

    if (!body.validation_url) {
      return c.json({ error: 'validation_url required' }, 400);
    }

    try {
      const response = await fetch(body.validation_url);
      const result = await response.json();
      return c.json({ ok: true, result });
    } catch (error) {
      return c.json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  });

  // POST /webhooks/inbound - Generic inbound email webhook
  // Accepts a standardized payload format that any email service can transform to
  // Authentication: Bearer token or HMAC signature required
  router.post('/webhooks/inbound', async (c) => {
    const db = c.get('db');

    // Get raw body for HMAC verification
    const rawBody = await c.req.text();

    let payload: GenericInboundEmailPayload;
    try {
      payload = JSON.parse(rawBody) as GenericInboundEmailPayload;
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    // Validate required fields
    if (!payload.from_email || !payload.to_email || !payload.subject) {
      return c.json({
        error: 'Missing required fields',
        required: ['from_email', 'to_email', 'subject']
      }, 400);
    }

    // Validate content (at least one of body_plain or body_html required)
    if (!payload.body_plain && !payload.body_html) {
      return c.json({
        error: 'Missing email content',
        required: 'At least one of body_plain or body_html is required'
      }, 400);
    }

    // Find email config by inbound address
    const toEmail = payload.to_email.toLowerCase();
    let emailConfig = await db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.inboundAddress, toEmail)
    });

    if (!emailConfig) {
      // Try to find by domain match
      const domain = toEmail.split('@')[1];
      const allConfigs = await db.select().from(emailConfigs);
      emailConfig = allConfigs.find(c =>
        c.inboundAddress && c.inboundAddress.toLowerCase().endsWith(`@${domain}`)
      );
    }

    if (!emailConfig) {
      return c.json({
        error: 'Unknown recipient',
        recipient: toEmail,
        hint: 'No email configuration found for this recipient address'
      }, 404);
    }

    if (!emailConfig.inboundEnabled) {
      return c.json({ error: 'Inbound email not enabled for this product' }, 404);
    }

    // Verify authentication
    if (!emailConfig.inboundWebhookSecret) {
      return c.json({
        error: 'Webhook secret not configured',
        hint: 'Generate a webhook secret using POST /admin/email-config/:productId/webhook-secret'
      }, 401);
    }

    const authResult = await verifyWebhookAuth(
      c.req.raw,
      rawBody,
      emailConfig.inboundWebhookSecret
    );

    if (!authResult.valid) {
      return c.json({
        error: 'Unauthorized',
        hint: 'Provide valid authentication via Authorization: Bearer <secret> or X-Webhook-Signature: sha256=<hmac>'
      }, 401);
    }

    // Log inbound email
    const inboundEmailId = nanoid();
    const now = new Date().toISOString();

    await db.insert(inboundEmails).values({
      id: inboundEmailId,
      productId: emailConfig.productId,
      messageId: payload.message_id || `generic-${inboundEmailId}`,
      provider: 'generic',
      fromEmail: payload.from_email,
      fromName: payload.from_name || null,
      toEmail: payload.to_email,
      subject: payload.subject,
      bodyPlain: payload.body_plain || null,
      bodyHtml: payload.body_html || null,
      processingStatus: 'pending',
      filterResult: null,
      ticketId: null,
      replyId: null,
      errorMessage: null,
      spfResult: payload.spf_result || null,
      dkimResult: payload.dkim_result ?? null,
      isSpam: payload.is_spam ?? false,
      rawPayload: rawBody,
      createdAt: now,
      processedAt: null
    });

    // Process asynchronously using waitUntil
    c.executionCtx.waitUntil(
      processInboundEmail(db, inboundEmailId)
        .then(result => {
          console.log(`Processed generic inbound email ${inboundEmailId}:`, result);
        })
        .catch(error => {
          console.error(`Failed to process generic inbound email ${inboundEmailId}:`, error);
        })
    );

    return c.json({
      ok: true,
      id: inboundEmailId,
      auth_method: authResult.method,
      message: 'Email received and queued for processing'
    });
  });

  return router;
};

/**
 * Parse sender name from From header
 * e.g., "John Doe <john@example.com>" -> "John Doe"
 */
function parseFromName(fromHeader: string): string | null {
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (match) {
    return match[1].trim();
  }
  return null;
}
