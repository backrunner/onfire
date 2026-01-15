/**
 * Telegram Bot Notification Provider
 */
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo, TelegramChannelConfig } from '../types';

export class TelegramProvider extends BaseNotificationProvider {
  type = 'telegram' as const;

  async send(_agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    const config = this.config as unknown as TelegramChannelConfig;

    if (!config.botToken || !config.chatId) {
      return { success: false, error: 'Telegram configuration incomplete' };
    }

    try {
      const message = this.buildTelegramMessage(payload);

      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });

      const data = await response.json() as { ok: boolean; description?: string; result?: { message_id?: number } };

      if (!data.ok) {
        return { success: false, error: data.description || 'Telegram API error' };
      }

      return { success: true, messageId: String(data.result?.message_id) };
    } catch (error) {
      return { success: false, error: `Telegram send failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async validateConfig(): Promise<boolean> {
    const config = this.config as unknown as TelegramChannelConfig;
    return !!(config.botToken && config.chatId);
  }

  private buildTelegramMessage(payload: NotificationPayload): string {
    const priorityEmoji = payload.ticketPriority === 'high' ? '🔴' : payload.ticketPriority === 'medium' ? '🟡' : '🟢';
    const eventEmoji = payload.triggerEvent === 'ticket_escalated' ? '⬆️' : payload.triggerEvent === 'ticket_reassigned' ? '🔄' : '📥';

    let message = `
${eventEmoji} <b>${this.escapeHtml(this.formatTitle(payload))}</b>

<b>Ticket:</b> #${this.escapeHtml(payload.ticketId)}
<b>Subject:</b> ${this.escapeHtml(payload.ticketSubject)}
<b>Priority:</b> ${priorityEmoji} ${payload.ticketPriority.toUpperCase()}
<b>Customer:</b> ${this.escapeHtml(payload.customerName || payload.customerEmail)}`;

    if (payload.previousAgentName && payload.triggerEvent !== 'ticket_assigned') {
      message += `\n<b>From Agent:</b> ${this.escapeHtml(payload.previousAgentName)}`;
    }

    message += `

<blockquote>${this.escapeHtml(payload.ticketContent.substring(0, 300))}${payload.ticketContent.length > 300 ? '...' : ''}</blockquote>

<a href="${payload.ticketUrl}">View Ticket →</a>`;

    return message.trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
