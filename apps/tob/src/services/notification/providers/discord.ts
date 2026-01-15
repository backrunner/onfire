/**
 * Discord Webhook Notification Provider
 */
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo, DiscordChannelConfig } from '../types';

export class DiscordProvider extends BaseNotificationProvider {
  type = 'discord' as const;

  async send(_agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    const config = this.config as unknown as DiscordChannelConfig;

    if (!config.webhookUrl) {
      return { success: false, error: 'Discord webhook URL not configured' };
    }

    try {
      const embed = this.buildDiscordEmbed(payload);

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'OnFire Notifications',
          embeds: [embed]
        })
      });

      // Discord returns 204 No Content on success
      if (response.status === 204 || response.ok) {
        return { success: true };
      }

      const text = await response.text();
      return { success: false, error: `Discord API error: ${response.status} - ${text}` };
    } catch (error) {
      return { success: false, error: `Discord send failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async validateConfig(): Promise<boolean> {
    const config = this.config as unknown as DiscordChannelConfig;
    return !!(config.webhookUrl && config.webhookUrl.startsWith('https://discord.com/api/webhooks/'));
  }

  private buildDiscordEmbed(payload: NotificationPayload): Record<string, unknown> {
    const colors: Record<string, number> = {
      high: 0xef4444,    // Red
      medium: 0xf59e0b,  // Amber
      low: 0x22c55e      // Green
    };

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: 'Ticket ID', value: `#${payload.ticketId}`, inline: true },
      { name: 'Priority', value: payload.ticketPriority.toUpperCase(), inline: true },
      { name: 'Customer', value: payload.customerName || payload.customerEmail, inline: true }
    ];

    if (payload.previousAgentName && payload.triggerEvent !== 'ticket_assigned') {
      fields.push({ name: 'From Agent', value: payload.previousAgentName, inline: true });
    }

    return {
      title: this.formatTitle(payload),
      description: `**${payload.ticketSubject}**\n\n${payload.ticketContent.substring(0, 400)}${payload.ticketContent.length > 400 ? '...' : ''}`,
      color: colors[payload.ticketPriority] || colors.medium,
      fields,
      url: payload.ticketUrl,
      timestamp: new Date().toISOString(),
      footer: {
        text: payload.productName
      }
    };
  }
}
