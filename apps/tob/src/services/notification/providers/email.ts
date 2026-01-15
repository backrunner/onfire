/**
 * Email Notification Provider
 * Uses existing email service infrastructure
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@onfire/shared/drizzle/client';
import { emailConfigs } from '@onfire/shared/drizzle/schema';
import { BaseNotificationProvider } from './base';
import type { NotificationPayload, NotificationResult, AgentInfo } from '../types';
import { createEmailProvider } from '../../email/providers';

export class EmailNotificationProvider extends BaseNotificationProvider {
  type = 'email' as const;
  private db: Db;
  private productId: string;

  constructor(config: Record<string, unknown>, db: Db, productId: string) {
    super(config);
    this.db = db;
    this.productId = productId;
  }

  async send(agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult> {
    // Get email config for product
    const emailConfig = await this.db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, this.productId)
    });

    if (!emailConfig || !emailConfig.outboundEnabled) {
      return { success: false, error: 'Email not configured for this product' };
    }

    const provider = createEmailProvider(emailConfig);

    const html = this.buildEmailHtml(agent, payload);
    const text = this.formatMessage(payload);

    return provider.send({
      to: { email: agent.email, name: agent.displayName },
      from: {
        email: emailConfig.outboundSenderEmail || 'noreply@onfire.local',
        name: emailConfig.outboundSenderName || 'OnFire Notifications'
      },
      // No reply-to for agent notifications - these are no-reply
      subject: this.formatTitle(payload),
      html,
      text,
      headers: {
        'X-Ticket-ID': payload.ticketId,
        'X-Notification-Type': 'agent-notification',
        'X-Auto-Response-Suppress': 'All' // Prevent auto-replies
      }
    });
  }

  private buildEmailHtml(agent: AgentInfo, payload: NotificationPayload): string {
    const eventLabels: Record<string, string> = {
      ticket_assigned: 'A new ticket has been assigned to you',
      ticket_reassigned: 'A ticket has been reassigned to you',
      ticket_escalated: 'A ticket has been escalated to you'
    };

    const priorityColors: Record<string, string> = {
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#22c55e'
    };

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #18181b; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">${this.escapeHtml(this.formatTitle(payload))}</h2>
  </div>

  <div style="border: 1px solid #e4e4e7; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p>Hi ${this.escapeHtml(agent.displayName)},</p>
    <p>${eventLabels[payload.triggerEvent] || 'You have a ticket update'}.</p>

    <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #71717a; width: 120px;">Ticket ID:</td>
          <td style="padding: 4px 0; font-weight: 500;">#${this.escapeHtml(payload.ticketId)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a;">Subject:</td>
          <td style="padding: 4px 0; font-weight: 500;">${this.escapeHtml(payload.ticketSubject)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a;">Priority:</td>
          <td style="padding: 4px 0;">
            <span style="background: ${priorityColors[payload.ticketPriority] || priorityColors.medium}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${payload.ticketPriority.toUpperCase()}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #71717a;">Customer:</td>
          <td style="padding: 4px 0;">${this.escapeHtml(payload.customerName || payload.customerEmail)}</td>
        </tr>
        ${payload.previousAgentName ? `
        <tr>
          <td style="padding: 4px 0; color: #71717a;">From Agent:</td>
          <td style="padding: 4px 0;">${this.escapeHtml(payload.previousAgentName)}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background: #fafafa; border-left: 4px solid #18181b; padding: 12px 16px; margin: 16px 0;">
      <p style="margin: 0; white-space: pre-wrap;">${this.escapeHtml(payload.ticketContent.substring(0, 500))}${payload.ticketContent.length > 500 ? '...' : ''}</p>
    </div>

    <a href="${payload.ticketUrl}" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Ticket</a>

    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">

    <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
      This is an automated notification from ${this.escapeHtml(payload.productName)}. Please do not reply to this email.
    </p>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
