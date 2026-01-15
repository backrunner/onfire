/**
 * ntfy Notification Provider
 * https://ntfy.sh/
 */
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo, NtfyChannelConfig } from '../types';

export class NtfyProvider extends BaseNotificationProvider {
  type = 'ntfy' as const;

  async send(_agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    const config = this.config as unknown as NtfyChannelConfig;

    if (!config.serverUrl || !config.topic) {
      return { success: false, error: 'ntfy configuration incomplete' };
    }

    try {
      // Normalize server URL
      const serverUrl = config.serverUrl.replace(/\/$/, '');

      const headers: Record<string, string> = {
        'Title': this.formatTitle(payload),
        'Priority': this.mapPriority(payload.ticketPriority),
        'Tags': `ticket,${payload.triggerEvent.replace('ticket_', '')}`,
        'Click': payload.ticketUrl,
        'Actions': `view, View Ticket, ${payload.ticketUrl}`
      };

      if (config.authToken) {
        headers['Authorization'] = `Bearer ${config.authToken}`;
      }

      const response = await fetch(`${serverUrl}/${config.topic}`, {
        method: 'POST',
        headers,
        body: this.formatMessage(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `ntfy API error: ${response.status} - ${text}` };
      }

      const data = await response.json() as { id?: string };
      return { success: true, messageId: data.id };
    } catch (error) {
      return { success: false, error: `ntfy send failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async validateConfig(): Promise<boolean> {
    const config = this.config as unknown as NtfyChannelConfig;
    return !!(config.serverUrl && config.topic);
  }

  private mapPriority(priority: string): string {
    switch (priority) {
      case 'high': return '5';
      case 'medium': return '3';
      case 'low': return '2';
      default: return '3';
    }
  }
}
