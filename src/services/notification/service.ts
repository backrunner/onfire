import type { Database } from "@/lib/db";
import {
  notificationChannels,
  notificationLogs,
  tickets,
  products,
  agentProfiles,
  users,
} from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { NotificationTriggerEvent } from "@/drizzle/schema";

export interface SendNotificationOptions {
  ticketId: string;
  agentId: string;
  triggerEvent: NotificationTriggerEvent;
  previousAgentName?: string;
}

export async function sendAgentNotification(
  db: Database,
  options: SendNotificationOptions
): Promise<void> {
  const { ticketId, agentId, triggerEvent, previousAgentName } = options;

  // Get ticket
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    console.error(`Ticket not found: ${ticketId}`);
    return;
  }

  // Get notification channels for this product and event
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.productId, ticket.productId),
        eq(notificationChannels.enabled, true)
      )
    );

  const now = new Date().toISOString();

  for (const channel of channels) {
    // Check if this channel handles this event
    const triggerEvents = JSON.parse(channel.triggerEvents || "[]") as string[];
    if (!triggerEvents.includes(triggerEvent)) {
      continue;
    }

    // Log the notification attempt
    const logId = crypto.randomUUID();
    await db.insert(notificationLogs).values({
      id: logId,
      productId: ticket.productId,
      channelId: channel.id,
      channelType: channel.channelType,
      ticketId,
      agentId,
      triggerEvent,
      status: "pending",
      createdAt: now,
    });

    try {
      // Get agent info
      const profile = await db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.userId, agentId),
      });
      const agentName =
        profile?.displayName ||
        (
          await db.query.users.findFirst({
            where: eq(users.id, agentId),
          })
        )?.displayName ||
        "Agent";

      // Get product name
      const product = await db.query.products.findFirst({
        where: eq(products.id, ticket.productId),
      });

      // Build notification message
      const message = buildNotificationMessage({
        triggerEvent,
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        agentName,
        productName: product?.name || "",
        previousAgentName,
      });

      // TODO: Send via channel provider
      console.log(
        `Notification [${channel.channelType}] to ${agentId}: ${message}`
      );

      // Update log as sent
      await db
        .update(notificationLogs)
        .set({ status: "sent", sentAt: new Date().toISOString() })
        .where(eq(notificationLogs.id, logId));
    } catch (error) {
      // Update log as failed
      await db
        .update(notificationLogs)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(notificationLogs.id, logId));
    }
  }
}

function buildNotificationMessage(params: {
  triggerEvent: NotificationTriggerEvent;
  ticketId: string;
  ticketSubject: string;
  agentName: string;
  productName: string;
  previousAgentName?: string;
}): string {
  const {
    triggerEvent,
    ticketId,
    ticketSubject,
    agentName,
    productName,
    previousAgentName,
  } = params;

  switch (triggerEvent) {
    case "ticket_assigned":
      return `New ticket assigned to ${agentName}: [${ticketId}] ${ticketSubject} (${productName})`;
    case "ticket_reassigned":
      return `Ticket reassigned from ${previousAgentName || "another agent"} to ${agentName}: [${ticketId}] ${ticketSubject}`;
    case "ticket_escalated":
      return `Ticket escalated to ${agentName}: [${ticketId}] ${ticketSubject} (from ${previousAgentName || "another agent"})`;
    default:
      return `Notification for ${agentName}: [${ticketId}] ${ticketSubject}`;
  }
}
