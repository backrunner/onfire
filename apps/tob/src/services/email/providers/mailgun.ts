/**
 * Mailgun Email Provider
 * https://documentation.mailgun.com/en/latest/api-sending-messages.html
 */
import { BaseEmailProvider } from './base';
import type { EmailMessage, SendResult } from '../types';

export class MailgunProvider extends BaseEmailProvider {
  name = 'mailgun';

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = this.config.outboundApiKey;
    if (!apiKey) {
      return { success: false, error: 'Mailgun API key not configured' };
    }

    // Extract domain from sender email
    const domain = message.from.email.split('@')[1];
    if (!domain) {
      return { success: false, error: 'Invalid sender email - cannot extract domain' };
    }

    try {
      const formData = new FormData();
      formData.append('from', message.from.name
        ? `${message.from.name} <${message.from.email}>`
        : message.from.email);
      formData.append('to', message.to.name
        ? `${message.to.name} <${message.to.email}>`
        : message.to.email);
      formData.append('subject', message.subject);
      formData.append('html', message.html);
      if (message.text) {
        formData.append('text', message.text);
      }
      if (message.replyTo) {
        formData.append('h:Reply-To', message.replyTo);
      }

      // Add custom headers
      if (message.headers) {
        for (const [key, value] of Object.entries(message.headers)) {
          formData.append(`h:${key}`, value);
        }
      }

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${apiKey}`)}`
        },
        body: formData
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `Mailgun API error: ${response.status}`
        };
      }

      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      return {
        success: false,
        error: `Mailgun send failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!this.config.outboundApiKey;
  }
}
