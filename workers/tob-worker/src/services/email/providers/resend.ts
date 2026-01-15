/**
 * Resend Email Provider
 * https://resend.com/docs/api-reference/emails/send-email
 */
import { BaseEmailProvider } from './base';
import type { EmailMessage, SendResult } from '../types';

export class ResendProvider extends BaseEmailProvider {
  name = 'resend';

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = this.config.outboundApiKey;
    if (!apiKey) {
      return { success: false, error: 'Resend API key not configured' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: message.from.name
            ? `${message.from.name} <${message.from.email}>`
            : message.from.email,
          to: [message.to.name
            ? `${message.to.name} <${message.to.email}>`
            : message.to.email],
          reply_to: message.replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers
        })
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `Resend API error: ${response.status}`
        };
      }

      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      return {
        success: false,
        error: `Resend send failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!this.config.outboundApiKey;
  }
}
