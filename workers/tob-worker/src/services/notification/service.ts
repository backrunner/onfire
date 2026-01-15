/**
 * Notification Service
 * Handles sending notifications to agents through configured channels
 */
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Db } from '@onfire/shared/drizzle/client';
import type { NotificationTriggerEvent } from '@onfire/shared/drizzle/schema';
import {
  notificationChannels,
  notificationLogs,
  tickets,
  products,
  users,
  agentProfiles
} from '@onfire/shared/drizzle/schema';
import { createNotificationProvider } from './providers';
import type { NotificationPayload, AgentInfo, NotificationResult } from './types';

export interface SendAgentNotificationOptions {
  ticketId: string;
  agentId: string;
  triggerEvent: NotificationTriggerEvent;
  previousAgentName?: string;
}

export interface SendNotificationResult {
  success: boolean;
  channelResults: {
    channelId: string;
    channelType: string;
    success: boolean;
    error?: string;
  }[];
}

/**
 * Get the ToB dashboard URL for a ticket
 */
function getTicketUrl(ticketId: string): string {
  // This should be configured via environment variable in production
  // For now, use a relative path that works with the ToB frontend
  return `/tickets/${ticketId}`;
}

/**
 * Get agent info for notification
 */
async function getAgentInfo(db: Db, agentId: string): Promise<AgentInfo | null> {
  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, agentId)
  });

  if (!user) {
    return null;
  }

  // Try to get agent profile for custom display name/email
  const profile = await db.query.agentProfiles.findFirst({
    where: eq(agentProfiles.userId, agentId)
  });

  return {
    userId: agentId,
    email: profile?.email || user.email,
    displayName: profile?.displayName || user.displayName
  };
}

/**
 * Send notifications to an agent through all configured channels
 */
export async function sendAgentNotification(
  db: Db,
  options: SendAgentNotificationOptions
): Promise<SendNotificationResult> {
  const { ticketId, agentId, triggerEvent, previousAgentName } = options;

  // 1. Get ticket info
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId)
  });

  if (!ticket) {
    return { success: false, channelResults: [] };
  }

  // 2. Get product info
  const product = await db.query.products.findFirst({
    where: eq(products.id, ticket.productId)
  });

  if (!product) {
    return { success: false, channelResults: [] };
  }

  // 3. Get agent info
  const agent = await getAgentInfo(db, agentId);
  if (!agent) {
    return { success: false, channelResults: [] };
  }

  // 4. Get enabled notification channels for this product and trigger event
  const channels = await db.select().from(notificationChannels)
    .where(and(
      eq(notificationChannels.productId, ticket.productId),
      eq(notificationChannels.enabled, true)
    ));

  // Filter channels that have this trigger event enabled
  const activeChannels = channels.filter(channel => {
    try {
      const events = JSON.parse(channel.triggerEvents) as string[];
      return events.includes(triggerEvent);
    } catch {
      return false;
    }
  });

  if (activeChannels.length === 0) {
    return { success: true, channelResults: [] };
  }

  // 5. Build notification payload
  const payload: NotificationPayload = {
    ticketId: ticket.id,
    ticketSubject: ticket.subject,
    ticketContent: ticket.content,
    ticketPriority: ticket.priority,
    ticketUrl: getTicketUrl(ticket.id),
    customerEmail: ticket.customerEmail,
    productName: product.name,
    triggerEvent,
    previousAgentName
  };

  // 6. Send notifications through all active channels
  const channelResults: SendNotificationResult['channelResults'] = [];

  await Promise.all(activeChannels.map(async (channel) => {
    const logId = nanoid();
    const now = new Date().toISOString();

    try {
      // Parse channel config
      const config = JSON.parse(channel.config) as Record<string, unknown>;

      // Create provider
      const provider = createNotificationProvider(
        channel.channelType,
        config,
        db,
        ticket.productId
      );

      // Send notification
      const result = await provider.send(agent, payload);

      // Log result
      await db.insert(notificationLogs).values({
        id: logId,
        productId: ticket.productId,
        channelId: channel.id,
        channelType: channel.channelType,
        ticketId: ticket.id,
        agentId,
        triggerEvent,
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.error || null,
        createdAt: now,
        sentAt: result.success ? now : null
      });

      channelResults.push({
        channelId: channel.id,
        channelType: channel.channelType,
        success: result.success,
        error: result.error
      });
    } catch (error) {
      // Log error
      await db.insert(notificationLogs).values({
        id: logId,
        productId: ticket.productId,
        channelId: channel.id,
        channelType: channel.channelType,
        ticketId: ticket.id,
        agentId,
        triggerEvent,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        createdAt: now,
        sentAt: null
      });

      channelResults.push({
        channelId: channel.id,
        channelType: channel.channelType,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }));

  // Return overall success if at least one channel succeeded
  const anySuccess = channelResults.some(r => r.success);
  return { success: anySuccess, channelResults };
}

/**
 * Send a test notification to verify channel configuration
 */
export async function sendTestNotification(
  db: Db,
  channelId: string,
  testAgentId: string
): Promise<NotificationResult> {
  // Get channel
  const channel = await db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, channelId)
  });

  if (!channel) {
    return { success: false, error: 'Channel not found' };
  }

  // Get product
  const product = await db.query.products.findFirst({
    where: eq(products.id, channel.productId)
  });

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  // Get agent info
  const agent = await getAgentInfo(db, testAgentId);
  if (!agent) {
    return { success: false, error: 'Agent not found' };
  }

  // Build test payload
  const payload: NotificationPayload = {
    ticketId: 'TEST-001',
    ticketSubject: 'Test Notification',
    ticketContent: 'This is a test notification to verify your notification channel configuration is working correctly.',
    ticketPriority: 'medium',
    ticketUrl: getTicketUrl('TEST-001'),
    customerEmail: 'test@example.com',
    customerName: 'Test Customer',
    productName: product.name,
    triggerEvent: 'ticket_assigned'
  };

  try {
    const config = JSON.parse(channel.config) as Record<string, unknown>;
    const provider = createNotificationProvider(
      channel.channelType,
      config,
      db,
      channel.productId
    );

    return await provider.send(agent, payload);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
