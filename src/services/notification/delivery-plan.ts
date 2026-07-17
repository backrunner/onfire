import type { NotificationChannelType } from "@/drizzle/schema";

export type NotificationPolicySource =
  | { ruleId: string; requirementId?: never }
  | { ruleId?: never; requirementId: string };

export type RecipientMatch = NotificationPolicySource & {
  userId: string;
  channelTypes: NotificationChannelType[];
};

export interface EndpointDescriptor {
  id: string;
  userId: string;
  channelType: NotificationChannelType;
}

export function buildDeliveryPlan<T extends EndpointDescriptor>(
  matches: RecipientMatch[],
  endpoints: T[]
): {
  deliveries: Array<NotificationPolicySource & { userId: string; endpoint: T }>;
  missing: Array<NotificationPolicySource & {
    userId: string;
    channelType: NotificationChannelType;
  }>;
} {
  const deliveries = new Map<
    string,
    NotificationPolicySource & { userId: string; endpoint: T }
  >();
  const missing = new Map<
    string,
    NotificationPolicySource & {
      userId: string;
      channelType: NotificationChannelType;
    }
  >();

  for (const match of matches) {
    const source: NotificationPolicySource = match.requirementId
      ? { requirementId: match.requirementId }
      : { ruleId: match.ruleId as string };
    for (const channelType of match.channelTypes) {
      const matchingEndpoints = endpoints.filter(
        (endpoint) =>
          endpoint.userId === match.userId &&
          endpoint.channelType === channelType
      );
      if (matchingEndpoints.length === 0) {
        const sourceId = match.requirementId ?? match.ruleId;
        missing.set(`${sourceId}:${match.userId}:${channelType}`, {
          ...source,
          userId: match.userId,
          channelType,
        });
        continue;
      }
      for (const endpoint of matchingEndpoints) {
        deliveries.set(`${match.userId}:${endpoint.id}`, {
          ...source,
          userId: match.userId,
          endpoint,
        });
      }
    }
  }

  return {
    deliveries: [...deliveries.values()],
    missing: [...missing.values()],
  };
}
