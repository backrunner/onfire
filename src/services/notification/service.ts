import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import {
  agents,
  agentProfiles,
  agentTeams,
  notificationEndpoints,
  notificationLogs,
  notificationRequirements,
  notificationRules,
  productTeams,
  products,
  tickets,
  users,
  type NotificationChannelType,
  type NotificationRuleRow,
  type NotificationRequirementRow,
  type NotificationTriggerEvent,
} from "@/drizzle/schema";
import { createChannel, type ChannelConfig } from "./channels";
import {
  openEndpointConfig,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";
import {
  notificationChannelTypesSchema,
  notificationTriggerEventsSchema,
} from "@/lib/notifications/policy-schema";
import {
  buildDeliveryPlan,
  type RecipientMatch,
} from "./delivery-plan";

export interface SendNotificationOptions {
  ticketId: string;
  agentId?: string;
  triggerEvent: NotificationTriggerEvent;
  previousAgentName?: string;
  customerEmail?: string;
}

export async function sendRecipientNotifications(
  db: Database,
  options: SendNotificationOptions
): Promise<void> {
  const { ticketId, agentId, triggerEvent, previousAgentName, customerEmail } =
    options;
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!ticket) {
    console.error(`Ticket not found: ${ticketId}`);
    return;
  }

  const [rules, requirements] = await Promise.all([
    db
      .select()
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.productId, ticket.productId),
          eq(notificationRules.enabled, true)
        )
      ),
    db
      .select()
      .from(notificationRequirements)
      .where(
        and(
          eq(notificationRequirements.productId, ticket.productId),
          eq(notificationRequirements.enabled, true)
        )
      ),
  ]);

  const matches: RecipientMatch[] = [];
  for (const rule of rules) {
    const events = parsePolicyEvents(rule);
    const channelTypes = parsePolicyChannelTypes(rule);
    if (!events.includes(triggerEvent) || channelTypes.length === 0) continue;
    const recipientIds = await resolveRuleRecipients(db, rule, ticket);
    for (const userId of recipientIds) {
      matches.push({ ruleId: rule.id, userId, channelTypes });
    }
  }
  for (const requirement of requirements) {
    const events = parsePolicyEvents(requirement);
    const channelTypes = parsePolicyChannelTypes(requirement);
    if (!events.includes(triggerEvent) || channelTypes.length === 0) continue;
    const recipientIds = await resolveRequirementRecipients(
      db,
      requirement
    );
    for (const userId of recipientIds) {
      matches.push({
        requirementId: requirement.id,
        userId,
        channelTypes,
      });
    }
  }
  if (matches.length === 0) return;

  const recipientIds = [...new Set(matches.map((match) => match.userId))];
  const endpoints = await db
    .select()
    .from(notificationEndpoints)
    .where(
      and(
        inArray(notificationEndpoints.userId, recipientIds),
        eq(notificationEndpoints.enabled, true)
      )
    );

  const plan = buildDeliveryPlan(matches, endpoints);

  const now = new Date().toISOString();
  for (const missing of plan.missing) {
    await db.insert(notificationLogs).values({
      id: crypto.randomUUID(),
      productId: ticket.productId,
      ruleId: missing.ruleId ?? null,
      requirementId: missing.requirementId ?? null,
      endpointId: null,
      recipientUserId: missing.userId,
      channelType: missing.channelType,
      ticketId,
      triggerEvent,
      status: "failed",
      errorMessage: `Recipient has no enabled ${missing.channelType} endpoint`,
      createdAt: now,
    });
  }

  let agentName = "System";
  if (agentId) {
    const [profile, user] = await Promise.all([
      db.query.agentProfiles.findFirst({
        where: eq(agentProfiles.userId, agentId),
      }),
      db.query.users.findFirst({ where: eq(users.id, agentId) }),
    ]);
    agentName = profile?.displayName || user?.displayName || "Agent";
  }
  const product = await db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  const message = buildNotificationMessage({
    triggerEvent,
    ticketId: ticket.id,
    ticketSubject: ticket.subject,
    agentName,
    productName: product?.name || "",
    previousAgentName,
    customerEmail: customerEmail || ticket.customerEmail || undefined,
  });

  for (const delivery of plan.deliveries) {
    const logId = crypto.randomUUID();
    await db.insert(notificationLogs).values({
      id: logId,
      productId: ticket.productId,
      ruleId: delivery.ruleId ?? null,
      requirementId: delivery.requirementId ?? null,
      endpointId: delivery.endpoint.id,
      recipientUserId: delivery.userId,
      channelType: delivery.endpoint.channelType,
      ticketId,
      triggerEvent,
      status: "pending",
      createdAt: now,
    });

    try {
      const parsedConfig = JSON.parse(delivery.endpoint.config || "{}") as unknown;
      if (
        !parsedConfig ||
        typeof parsedConfig !== "object" ||
        Array.isArray(parsedConfig)
      ) {
        throw new Error("Invalid notification endpoint configuration");
      }
      const channelConfig: ChannelConfig = {
        type: delivery.endpoint.channelType,
        config: await openEndpointConfig(
          delivery.endpoint.id,
          parsedConfig as Record<string, unknown>,
          getEnv().AUTH_SECRET
        ),
      };
      const configIssues = validateChannelConfig(
        channelConfig.type,
        channelConfig.config
      );
      if (configIssues.length > 0) {
        throw new Error(
          `Invalid notification endpoint configuration: ${configIssues.join("; ")}`
        );
      }
      const provider = await createChannel(channelConfig, {
        db,
        productId: ticket.productId,
      });
      const result = await provider.send(message);
      await db
        .update(notificationLogs)
        .set(
          result.success
            ? { status: "sent", sentAt: new Date().toISOString() }
            : {
                status: "failed",
                errorMessage: result.error?.slice(0, 2_000),
              }
        )
        .where(eq(notificationLogs.id, logId));
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

function parsePolicyEvents(policy: {
  triggerEvents: string;
}): NotificationTriggerEvent[] {
  try {
    const parsed = notificationTriggerEventsSchema.safeParse(
      JSON.parse(policy.triggerEvents || "[]")
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function parsePolicyChannelTypes(
  policy: { channelTypes: string }
): NotificationChannelType[] {
  try {
    const parsed = notificationChannelTypesSchema.safeParse(
      JSON.parse(policy.channelTypes || "[]")
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function resolveRuleRecipients(
  db: Database,
  rule: NotificationRuleRow,
  ticket: typeof tickets.$inferSelect
): Promise<string[]> {
  if (rule.recipientType === "assignee") {
    return ticket.assigneeId
      ? activeProductUser(db, ticket.productId, ticket.assigneeId)
      : [];
  }
  if (rule.recipientType === "user") {
    if (!rule.recipientUserId) return [];
    return activeProductUser(db, ticket.productId, rule.recipientUserId);
  }
  if (rule.recipientType === "product_agents") {
    return activeProductMembers(db, ticket.productId);
  }
  if (rule.recipientType === "ticket_team") {
    return ticket.teamId ? activeTeamMembers(db, ticket.teamId) : [];
  }
  return rule.recipientTeamId
    ? activeProductTeamMembers(db, ticket.productId, rule.recipientTeamId)
    : [];
}

async function resolveRequirementRecipients(
  db: Database,
  requirement: NotificationRequirementRow
): Promise<string[]> {
  if (requirement.scopeType === "user") {
    if (!requirement.scopeUserId) return [];
    return activeProductUser(
      db,
      requirement.productId,
      requirement.scopeUserId
    );
  }
  if (requirement.scopeType === "team") {
    return requirement.scopeTeamId
      ? activeProductTeamMembers(
          db,
          requirement.productId,
          requirement.scopeTeamId
        )
      : [];
  }
  return activeProductMembers(db, requirement.productId);
}

async function activeProductMembers(
  db: Database,
  productId: string
): Promise<string[]> {
  const associations = await db
    .select({ teamId: productTeams.teamId })
    .from(productTeams)
    .where(eq(productTeams.productId, productId));
  const teamIds = associations.map((association) => association.teamId);
  if (teamIds.length === 0) return [];
  const rows = await db
    .select({ userId: agentTeams.userId })
    .from(agentTeams)
    .innerJoin(
      agents,
      and(eq(agents.userId, agentTeams.userId), eq(agents.active, true))
    )
    .where(inArray(agentTeams.teamId, teamIds));
  return [...new Set(rows.map((row) => row.userId))];
}

async function activeTeamMembers(
  db: Database,
  teamId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: agentTeams.userId })
    .from(agentTeams)
    .innerJoin(
      agents,
      and(eq(agents.userId, agentTeams.userId), eq(agents.active, true))
    )
    .where(eq(agentTeams.teamId, teamId));
  return [...new Set(rows.map((row) => row.userId))];
}

async function activeProductTeamMembers(
  db: Database,
  productId: string,
  teamId: string
): Promise<string[]> {
  const association = await db.query.productTeams.findFirst({
    where: and(
      eq(productTeams.productId, productId),
      eq(productTeams.teamId, teamId)
    ),
  });
  return association ? activeTeamMembers(db, teamId) : [];
}

async function activeProductUser(
  db: Database,
  productId: string,
  userId: string
): Promise<string[]> {
  const row = await db
    .select({ userId: agents.userId })
    .from(agents)
    .innerJoin(agentTeams, eq(agentTeams.userId, agents.userId))
    .innerJoin(
      productTeams,
      and(
        eq(productTeams.teamId, agentTeams.teamId),
        eq(productTeams.productId, productId)
      )
    )
    .where(and(eq(agents.userId, userId), eq(agents.active, true)))
    .get();
  return row ? [row.userId] : [];
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
        title: "New Ticket Created",
        body: `[#${shortId}] ${ticketSubject}\n\nFrom: ${customerEmail || "Unknown"}\nProduct: ${productName}`,
      };
    case "ticket_assigned":
      return {
        title: "New Ticket Assigned",
        body: `[#${shortId}] ${ticketSubject}\n\nAssigned to: ${agentName}\nProduct: ${productName}`,
      };
    case "ticket_reassigned":
      return {
        title: "Ticket Reassigned",
        body: `[#${shortId}] ${ticketSubject}\n\nReassigned from ${previousAgentName || "another agent"} to ${agentName}`,
      };
    case "ticket_escalated":
      return {
        title: "Ticket Escalated",
        body: `[#${shortId}] ${ticketSubject}\n\nEscalated to: ${agentName}\nFrom: ${previousAgentName || "another agent"}`,
      };
    case "ticket_expiring":
      return {
        title: "Ticket SLA Expiring Soon",
        body: `[#${shortId}] ${ticketSubject}\n\nAssigned to: ${agentName}\nProduct: ${productName}\n\nPlease respond before SLA breach.`,
      };
    case "customer_replied":
      return {
        title: "Customer Replied",
        body: `[#${shortId}] ${ticketSubject}\n\nCustomer: ${customerEmail || "Unknown"}\nAssigned to: ${agentName}`,
      };
    case "ticket_closed":
      return {
        title: "Ticket Closed",
        body: `[#${shortId}] ${ticketSubject}\n\nProduct: ${productName}\nHandled by: ${agentName}`,
      };
  }
}
