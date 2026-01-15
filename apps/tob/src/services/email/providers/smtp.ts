/**
 * SMTP Email Provider
 * Uses MailChannels API for Cloudflare Workers (no direct SMTP in Workers)
 * For production, consider using MailChannels or another HTTP-based SMTP relay
 */
import { BaseEmailProvider } from './base';
import type { EmailMessage, SendResult } from '../types';

export class SmtpProvider extends BaseEmailProvider {
  name = 'smtp';

  async send(message: EmailMessage): Promise<SendResult> {
    // Cloudflare Workers don't support direct SMTP connections
    // We use MailChannels API which is free for Cloudflare Workers
    // https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/

    const host = this.config.outboundSmtpHost;
    const port = this.config.outboundSmtpPort;
    const user = this.config.outboundSmtpUser;
    const pass = this.config.outboundSmtpPass;

    // If using MailChannels (default for Workers)
    if (!host || host === 'mailchannels') {
      return this.sendViaMailChannels(message);
    }

    // For custom SMTP, we need to use an HTTP relay service
    // This is a placeholder - in production, you'd use a service like
    // smtp2go, mailjet, or set up your own relay
    return {
      success: false,
      error: 'Direct SMTP not supported in Cloudflare Workers. Use MailChannels or an API-based provider.'
    };
  }

  private async sendViaMailChannels(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
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
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `MailChannels error: ${response.status} - ${errorText}`
        };
      }

      return {
        success: true,
        messageId: `mailchannels-${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        error: `MailChannels send failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    // MailChannels doesn't require config
    const host = this.config.outboundSmtpHost;
    if (!host || host === 'mailchannels') {
      return true;
    }
    // For custom SMTP, require all fields
    return !!(this.config.outboundSmtpHost && this.config.outboundSmtpPort);
  }
}
