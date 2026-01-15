/**
 * PushDeer Notification Provider
 * https://www.pushdeer.com/
 */
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo, PushDeerChannelConfig } from '../types';

export class PushDeerProvider extends BaseNotificationProvider {
  type = 'pushdeer' as const;

  async send(_agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    const config = this.config as unknown as PushDeerChannelConfig;

    if (!config.pushKey) {
      return { success: false, error: 'PushDeer push key not configured' };
    }

    try {
      const response = await fetch('https://api2.pushdeer.com/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          pushkey: config.pushKey,
          text: this.formatTitle(payload),
          desp: this.formatMarkdownMessage(payload),
          type: 'markdown'
        })
      });

      const data = await response.json() as { code: number; error?: string; content?: { result?: { id?: string }[] } };

      if (data.code !== 0) {
        return { success: false, error: data.error || 'PushDeer API error' };
      }

      return { success: true, messageId: data.content?.result?.[0]?.id };
    } catch (error) {
      return { success: false, error: `PushDeer send failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.config as unknown as PushDeerChannelConfig).pushKey;
  }

  private formatMarkdownMessage(payload: NotificationPayload): string {
    const lines = [
      `**Ticket #${payload.ticketId}**`,
      '',
      `**Subject:** ${payload.ticketSubject}`,
      `**Priority:** ${payload.ticketPriority.toUpperCase()}`,
      `**Customer:** ${payload.customerName || payload.customerEmail}`
    ];

    if (payload.previousAgentName && payload.triggerEvent !== 'ticket_assigned') {
      lines.push(`**From Agent:** ${payload.previousAgentName}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(payload.ticketContent.substring(0, 300) + (payload.ticketContent.length > 300 ? '...' : ''));
    lines.push('');
    lines.push(`[View Ticket](${payload.ticketUrl})`);

    return lines.join('\n');
  }
}
