/**
 * Maileroo Email Provider
 * https://maileroo.com/docs/sending-api/
 */
import { BaseEmailProvider } from './base';
import type { EmailMessage, SendResult } from '../types';

export class MailerooProvider extends BaseEmailProvider {
  name = 'maileroo';

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = this.config.outboundApiKey;
    if (!apiKey) {
      return { success: false, error: 'Maileroo API key not configured' };
    }

    try {
      const response = await fetch('https://smtp.maileroo.com/send', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: message.from.name
            ? `${message.from.name} <${message.from.email}>`
            : message.from.email,
          to: message.to.name
            ? `${message.to.name} <${message.to.email}>`
            : message.to.email,
          reply_to: message.replyTo,
          subject: message.subject,
          html: message.html,
          plain: message.text
        })
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.error || `Maileroo API error: ${response.status}`
        };
      }

      return {
        success: true,
        messageId: data.message_id || data.id
      };
    } catch (error) {
      return {
        success: false,
        error: `Maileroo send failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!this.config.outboundApiKey;
  }
}
