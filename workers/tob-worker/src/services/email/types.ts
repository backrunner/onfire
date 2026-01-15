/**
 * Email Service Types
 */
import type { EmailConfigRow, EmailTemplateRow, EmailProvider, EmailTemplateType } from '@onfire/shared/drizzle/schema';

// Email message to send
export interface EmailMessage {
  to: { email: string; name?: string };
  from: { email: string; name?: string };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

// Result of sending an email
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Email provider interface
export interface IEmailProvider {
  name: string;
  send(message: EmailMessage): Promise<SendResult>;
  validateConfig(): Promise<boolean>;
}

// Template variables for rendering
export interface TemplateVariables {
  ticket_id: string;
  subject: string;
  customer_name: string;
  customer_email: string;
  agent_name?: string;
  reply_content?: string;
  product_name: string;
  ticket_url?: string;
  [key: string]: string | undefined;
}

// Maileroo webhook payload
export interface MailerooWebhookPayload {
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

// AI classification result
export interface EmailClassificationResult {
  classification: 'SUPPORT_REQUEST' | 'SPAM' | 'AUTO_REPLY' | 'MARKETING' | 'PERSONAL' | 'UNCLEAR';
  isSupport: boolean;
  confidence: number;
  category?: string;
  reasoning: string;
  suggestedAction: 'create_ticket' | 'ignore' | 'manual_review';
}

// Inbound email processing result
export interface ProcessInboundResult {
  success: boolean;
  action: 'ticket_created' | 'reply_added' | 'filtered' | 'error';
  ticketId?: string;
  replyId?: string;
  filterReason?: string;
  error?: string;
}

// Provider configuration from email_configs
export type ProviderConfig = Pick<EmailConfigRow,
  | 'outboundProvider'
  | 'outboundApiKey'
  | 'outboundSmtpHost'
  | 'outboundSmtpPort'
  | 'outboundSmtpUser'
  | 'outboundSmtpPass'
  | 'outboundSenderName'
  | 'outboundSenderEmail'
  | 'outboundReplyTo'
>;

// Available email providers metadata
export const EMAIL_PROVIDERS: Record<EmailProvider, { name: string; requiresApiKey: boolean; requiresSmtp: boolean }> = {
  resend: { name: 'Resend', requiresApiKey: true, requiresSmtp: false },
  sendgrid: { name: 'SendGrid', requiresApiKey: true, requiresSmtp: false },
  mailgun: { name: 'Mailgun', requiresApiKey: true, requiresSmtp: false },
  maileroo: { name: 'Maileroo', requiresApiKey: true, requiresSmtp: false },
  smtp: { name: 'SMTP', requiresApiKey: false, requiresSmtp: true }
};

// Default email templates
export const DEFAULT_TEMPLATES: Record<EmailTemplateType, { subject: string; body: string }> = {
  ticket_created: {
    subject: '[Ticket #{{ticket_id}}] {{subject}}',
    body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #18181b; margin-bottom: 16px;">Your support request has been received</h2>
    <p>Hi {{customer_name}},</p>
    <p>We've received your support request and created ticket <strong>#{{ticket_id}}</strong>.</p>
    <p><strong>Subject:</strong> {{subject}}</p>
    <p>Our team will review your request and respond as soon as possible.</p>
    <p style="color: #71717a; font-size: 14px;">You can reply to this email to add more information to your ticket.</p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
    <p style="color: #a1a1aa; font-size: 12px;">This email was sent by {{product_name}} Support</p>
  </div>
</body>
</html>`
  },
  ticket_replied: {
    subject: 'Re: [Ticket #{{ticket_id}}] {{subject}}',
    body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #18181b; margin-bottom: 16px;">New reply on your ticket</h2>
    <p>Hi {{customer_name}},</p>
    <p><strong>{{agent_name}}</strong> has replied to your ticket:</p>
    <div style="background: #f4f4f5; border-left: 4px solid #18181b; padding: 16px; margin: 16px 0;">
      {{reply_content}}
    </div>
    <p style="color: #71717a; font-size: 14px;">You can reply to this email to continue the conversation.</p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
    <p style="color: #a1a1aa; font-size: 12px;">This email was sent by {{product_name}} Support</p>
  </div>
</body>
</html>`
  },
  ticket_closed: {
    subject: 'Re: [Ticket #{{ticket_id}}] {{subject}} - Closed',
    body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #18181b; margin-bottom: 16px;">Your ticket has been closed</h2>
    <p>Hi {{customer_name}},</p>
    <p>Your support ticket <strong>#{{ticket_id}}</strong> has been closed.</p>
    <p><strong>Subject:</strong> {{subject}}</p>
    <p>If you have any further questions, feel free to open a new ticket or reply to this email.</p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
    <p style="color: #a1a1aa; font-size: 12px;">This email was sent by {{product_name}} Support</p>
  </div>
</body>
</html>`
  },
  ticket_escalated: {
    subject: 'Re: [Ticket #{{ticket_id}}] {{subject}} - Escalated',
    body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #18181b; margin-bottom: 16px;">Your ticket has been escalated</h2>
    <p>Hi {{customer_name}},</p>
    <p>Your support ticket <strong>#{{ticket_id}}</strong> has been escalated to a senior support specialist for further assistance.</p>
    <p><strong>Subject:</strong> {{subject}}</p>
    <p>Our team will review your request and respond as soon as possible.</p>
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
    <p style="color: #a1a1aa; font-size: 12px;">This email was sent by {{product_name}} Support</p>
  </div>
</body>
</html>`
  }
};
