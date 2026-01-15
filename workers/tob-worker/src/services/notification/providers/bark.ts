/**
 * Bark Notification Provider (iOS)
 * https://github.com/Finb/Bark
 */
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo, BarkChannelConfig } from '../types';

export class BarkProvider extends BaseNotificationProvider {
  type = 'bark' as const;

  async send(_agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    const config = this.config as unknown as BarkChannelConfig;

    if (!config.serverUrl || !config.deviceKey) {
      return { success: false, error: 'Bark configuration incomplete' };
    }

    try {
      // Normalize server URL
      const serverUrl = config.serverUrl.replace(/\/$/, '');
      const url = `${serverUrl}/${config.deviceKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: this.formatTitle(payload),
          body: `Ticket #${payload.ticketId}: ${payload.ticketSubject}`,
          url: payload.ticketUrl,
          group: payload.productName,
          level: payload.ticketPriority === 'high' ? 'timeSensitive' : 'active',
          badge: 1
        })
      });

      const data = await response.json() as { code: number; message?: string; data?: { id?: string } };

      if (data.code !== 200) {
        return { success: false, error: data.message || 'Bark API error' };
      }

      return { success: true, messageId: data.data?.id };
    } catch (error) {
      return { success: false, error: `Bark send failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async validateConfig(): Promise<boolean> {
    const config = this.config as unknown as BarkChannelConfig;
    return !!(config.serverUrl && config.deviceKey);
  }
}
