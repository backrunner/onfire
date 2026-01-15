/**
 * SendGrid Email Provider
 * https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */
import { BaseEmailProvider } from './base';
import type { EmailMessage, SendResult } from '../types';

export class SendGridProvider extends BaseEmailProvider {
  name = 'sendgrid';

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = this.config.outboundApiKey;
    if (!apiKey) {
      return { success: false, error: 'SendGrid API key not configured' };
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: message.to.email, name: message.to.name }]
          }],
          from: { email: message.from.email, name: message.from.name },
          reply_to: message.replyTo ? { email: message.replyTo } : undefined,
          subject: message.subject,
          content: [
            ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
            { type: 'text/html', value: message.html }
          ],
          headers: message.headers
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `SendGrid API error: ${response.status} - ${errorText}`
        };
      }

      // SendGrid returns message ID in header
      const messageId = response.headers.get('X-Message-Id');

      return {
        success: true,
        messageId: messageId || undefined
      };
    } catch (error) {
      return {
        success: false,
        error: `SendGrid send failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!this.config.outboundApiKey;
  }
}
