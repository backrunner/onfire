import type { Database } from "@/lib/db";
import {
  notificationChannels,
  notificationLogs,
  tickets,
  products,
  agentProfiles,
  users,
  customers,
} from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { NotificationTriggerEvent } from "@/drizzle/schema";
import { createChannel, type ChannelConfig } from "./channels";
import { getEnv } from "@/lib/db";
import {
  openChannelConfig,
  triggerEventsSchema,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";

export interface SendNotificationOptions {
  ticketId: string;
  agentId?: string;
  triggerEvent: NotificationTriggerEvent;
  previousAgentName?: string;
  customerEmail?: string;
}

export async function sendAgentNotification(
  db: Database,
  options: SendNotificationOptions
): Promise<void> {
  const { ticketId, agentId, triggerEvent, previousAgentName, customerEmail } = options;

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
    let parsedEvents: unknown;
    try {
      parsedEvents = JSON.parse(channel.triggerEvents || "[]");
    } catch {
      console.error(`Invalid trigger events for notification channel ${channel.id}`);
      continue;
    }
    const triggerEvents = triggerEventsSchema.safeParse(parsedEvents);
    if (!triggerEvents.success || !triggerEvents.data.includes(triggerEvent)) {
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
      agentId: agentId || "",
      triggerEvent,
      status: "pending",
      createdAt: now,
    });

    try {
      // Get agent info if available
      let agentName = "System";
      if (agentId) {
        const profile = await db.query.agentProfiles.findFirst({
          where: eq(agentProfiles.userId, agentId),
        });
        agentName =
          profile?.displayName ||
          (
            await db.query.users.findFirst({
              where: eq(users.id, agentId),
            })
          )?.displayName ||
          "Agent";
      }

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
        customerEmail: customerEmail || ticket.customerEmail || undefined,
      });

      // Create channel provider and send
      const parsedConfig = JSON.parse(channel.config || "{}") as unknown;
      if (
        !parsedConfig ||
        typeof parsedConfig !== "object" ||
        Array.isArray(parsedConfig)
      ) {
        throw new Error("Invalid notification channel configuration");
      }
      const channelConfig: ChannelConfig = {
        type: channel.channelType,
        config: await openChannelConfig(
          channel.id,
          parsedConfig as Record<string, unknown>,
          getEnv().AUTH_SECRET
        ),
      };
      const configIssues = validateChannelConfig(
        channelConfig.type,
        channelConfig.config
      );
      if (configIssues.length > 0) {
        throw new Error(`Invalid notification channel configuration: ${configIssues.join("; ")}`);
      }

      const provider = await createChannel(channelConfig, {
        db,
        productId: ticket.productId,
      });
      const result = await provider.send({
        title: message.title,
        body: message.body,
        url: message.url,
      });

      if (result.success) {
        await db
          .update(notificationLogs)
          .set({ status: "sent", sentAt: new Date().toISOString() })
          .where(eq(notificationLogs.id, logId));
      } else {
        await db
          .update(notificationLogs)
          .set({
            status: "failed",
            errorMessage: result.error?.slice(0, 2_000),
          })
          .where(eq(notificationLogs.id, logId));
      }
    } catch (error) {
      await db
        .update(notificationLogs)
        .set({
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown error",
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
  customerEmail?: string;
}): { title: string; body: string; url?: string } {
  const {
    triggerEvent,
    ticketId,
    ticketSubject,
    agentName,
    productName,
    previousAgentName,
    customerEmail,
  } = params;

  const shortId = ticketId.slice(-8);

  switch (triggerEvent) {
    case "ticket_created":
      return {
        title: `New Ticket Created`,
        body: `[#${shortId}] ${ticketSubject}\n\nFrom: ${customerEmail || "Unknown"}\nProduct: ${productName}`,
      };
    case "ticket_assigned":
      return {
        title: `New Ticket Assigned`,
        body: `[#${shortId}] ${ticketSubject}\n\nAssigned to: ${agentName}\nProduct: ${productName}`,
      };
    case "ticket_reassigned":
      return {
        title: `Ticket Reassigned`,
        body: `[#${shortId}] ${ticketSubject}\n\nReassigned from ${previousAgentName || "another agent"} to ${agentName}`,
      };
    case "ticket_escalated":
      return {
        title: `Ticket Escalated`,
        body: `[#${shortId}] ${ticketSubject}\n\nEscalated to: ${agentName}\nFrom: ${previousAgentName || "another agent"}`,
      };
    case "ticket_expiring":
      return {
        title: `Ticket SLA Expiring Soon`,
        body: `[#${shortId}] ${ticketSubject}\n\nAssigned to: ${agentName}\nProduct: ${productName}\n\nPlease respond before SLA breach.`,
      };
    case "customer_replied":
      return {
        title: `Customer Replied`,
        body: `[#${shortId}] ${ticketSubject}\n\nCustomer: ${customerEmail || "Unknown"}\nAssigned to: ${agentName}`,
      };
    case "ticket_closed":
      return {
        title: `Ticket Closed`,
        body: `[#${shortId}] ${ticketSubject}\n\nProduct: ${productName}\nHandled by: ${agentName}`,
      };
    default:
      return {
        title: `Ticket Notification`,
        body: `[#${shortId}] ${ticketSubject}\n\nAgent: ${agentName}`,
      };
  }
}
