/**
 * Outbound Email Service
 * Handles sending email notifications for ticket events
 */
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@onfire/shared/drizzle/client';
import type { EmailTemplateType } from '@onfire/shared/drizzle/schema';
import {
  emailConfigs,
  emailTemplates,
  outboundEmails,
  tickets,
  replies,
  products,
  users,
  agentProfiles
} from '@onfire/shared/drizzle/schema';
import { createEmailProvider } from './providers';
import { renderTemplateRaw, htmlToPlainText } from './templates';
import type { TemplateVariables, SendResult } from './types';
import { DEFAULT_TEMPLATES } from './types';

export interface SendTicketNotificationOptions {
  ticketId: string;
  templateType: EmailTemplateType;
  replyId?: string;
}

export interface SendNotificationResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

/**
 * Send a ticket notification email
 */
export async function sendTicketNotification(
  db: Db,
  options: SendTicketNotificationOptions
): Promise<SendNotificationResult> {
  const { ticketId, templateType, replyId } = options;

  // 1. Get ticket
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId)
  });
  if (!ticket) {
    return { success: false, error: 'Ticket not found' };
  }

  // 2. Get email config for product
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, ticket.productId)
  });
  if (!config || !config.outboundEnabled) {
    return { success: false, error: 'Outbound email not enabled for this product' };
  }

  // 3. Get product info
  const product = await db.query.products.findFirst({
    where: eq(products.id, ticket.productId)
  });
  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  // 4. Get template (custom or default)
  let template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.productId, ticket.productId)
  });

  // Filter by template type manually since we can't use AND in findFirst easily
  const allTemplates = await db.select().from(emailTemplates)
    .where(eq(emailTemplates.productId, ticket.productId));
  template = allTemplates.find(t => t.templateType === templateType && t.enabled);

  const subjectTemplate = template?.subjectTemplate || DEFAULT_TEMPLATES[templateType].subject;
  const bodyTemplate = template?.bodyTemplate || DEFAULT_TEMPLATES[templateType].body;

  // 5. Build template variables
  const variables: TemplateVariables = {
    ticket_id: ticket.id,
    subject: ticket.subject,
    customer_name: ticket.customerEmail.split('@')[0], // Use email prefix as name
    customer_email: ticket.customerEmail,
    product_name: product.name
  };

  // Add reply-specific variables
  if (replyId && templateType === 'ticket_replied') {
    const reply = await db.query.replies.findFirst({
      where: eq(replies.id, replyId)
    });
    if (reply) {
      variables.reply_content = reply.content;

      // Get agent name
      if (reply.senderId) {
        // Try agent profile first
        const profile = await db.query.agentProfiles.findFirst({
          where: eq(agentProfiles.userId, reply.senderId)
        });
        if (profile) {
          variables.agent_name = profile.displayName;
        } else {
          // Fall back to user
          const user = await db.query.users.findFirst({
            where: eq(users.id, reply.senderId)
          });
          if (user) {
            variables.agent_name = user.displayName;
          }
        }
      }
    }
  }

  // 6. Render template
  const subject = renderTemplateRaw(subjectTemplate, variables);
  const bodyHtml = renderTemplateRaw(bodyTemplate, variables);
  const bodyPlain = htmlToPlainText(bodyHtml);

  // 7. Create email provider
  const provider = createEmailProvider(config);

  // 8. Send email
  const sendResult = await provider.send({
    to: { email: ticket.customerEmail },
    from: {
      email: config.outboundSenderEmail || '',
      name: config.outboundSenderName || undefined
    },
    replyTo: config.outboundReplyTo || undefined,
    subject,
    html: bodyHtml,
    text: bodyPlain,
    headers: {
      'X-Ticket-ID': ticket.id,
      'References': `<ticket-${ticket.id}@onfire.local>`,
      'In-Reply-To': `<ticket-${ticket.id}@onfire.local>`
    }
  });

  // 9. Log outbound email
  const emailId = nanoid();
  const now = new Date().toISOString();

  await db.insert(outboundEmails).values({
    id: emailId,
    productId: ticket.productId,
    ticketId: ticket.id,
    replyId: replyId || null,
    toEmail: ticket.customerEmail,
    fromEmail: config.outboundSenderEmail || '',
    fromName: config.outboundSenderName || null,
    subject,
    bodyHtml,
    bodyPlain,
    provider: config.outboundProvider || 'smtp', // Default to smtp if not set
    providerMessageId: sendResult.messageId || null,
    status: sendResult.success ? 'sent' : 'failed',
    errorMessage: sendResult.error || null,
    createdAt: now,
    sentAt: sendResult.success ? now : null
  });

  // 10. Update reply email_sent flag if applicable
  if (replyId && sendResult.success) {
    await db.update(replies)
      .set({ emailSent: true })
      .where(eq(replies.id, replyId));
  }

  return {
    success: sendResult.success,
    emailId,
    error: sendResult.error
  };
}

/**
 * Test email configuration by sending a test email
 */
export async function sendTestEmail(
  db: Db,
  productId: string,
  testEmail: string
): Promise<SendResult> {
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId)
  });

  if (!config) {
    return { success: false, error: 'Email config not found' };
  }

  if (!config.outboundEnabled) {
    return { success: false, error: 'Outbound email not enabled' };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId)
  });

  const provider = createEmailProvider(config);

  return provider.send({
    to: { email: testEmail },
    from: {
      email: config.outboundSenderEmail || '',
      name: config.outboundSenderName || undefined
    },
    subject: `[Test] Email configuration test for ${product?.name || 'Unknown Product'}`,
    html: `
      <h2>Email Configuration Test</h2>
      <p>This is a test email to verify your email configuration is working correctly.</p>
      <p><strong>Product:</strong> ${product?.name || 'Unknown'}</p>
      <p><strong>Provider:</strong> ${config.outboundProvider}</p>
      <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
    `,
    text: `Email Configuration Test\n\nThis is a test email to verify your email configuration is working correctly.\n\nProduct: ${product?.name || 'Unknown'}\nProvider: ${config.outboundProvider}\nSent at: ${new Date().toISOString()}`
  });
}
