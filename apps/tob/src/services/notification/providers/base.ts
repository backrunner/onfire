/**
 * Base Notification Provider
 */
import type { NotificationChannelType } from '@onfire/shared/drizzle/schema';
import type { INotificationProvider, NotificationPayload, NotificationResult, AgentInfo } from '../types';

export abstract class BaseNotificationProvider implements INotificationProvider {
  abstract type: NotificationChannelType;
  protected config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  abstract send(agent: AgentInfo, payload: NotificationPayload): Promise<NotificationResult>;

  async validateConfig(): Promise<boolean> {
    return true;
  }

  protected formatTitle(payload: NotificationPayload): string {
    const eventLabels: Record<string, string> = {
      ticket_assigned: 'New Ticket Assigned',
      ticket_reassigned: 'Ticket Reassigned',
      ticket_escalated: 'Ticket Escalated'
    };
    return `[${payload.productName}] ${eventLabels[payload.triggerEvent] || 'Ticket Update'}`;
  }

  protected formatMessage(payload: NotificationPayload): string {
    const lines = [
      `Ticket #${payload.ticketId}`,
      `Subject: ${payload.ticketSubject}`,
      `Priority: ${payload.ticketPriority}`,
      `Customer: ${payload.customerName || payload.customerEmail}`
    ];

    if (payload.previousAgentName && payload.triggerEvent !== 'ticket_assigned') {
      lines.push(`Previous Agent: ${payload.previousAgentName}`);
    }

    lines.push('');
    lines.push(payload.ticketContent.substring(0, 200) + (payload.ticketContent.length > 200 ? '...' : ''));
    lines.push('');
    lines.push(`View ticket: ${payload.ticketUrl}`);

    return lines.join('\n');
  }
}
