import type { NotificationEndpointRow } from "@/drizzle/schema";

export const DEFAULT_EMAIL_ENDPOINT_NAME = "Account email";

export function createDefaultEmailEndpoint(
  userId: string,
  email: string,
  now = new Date().toISOString()
): NotificationEndpointRow {
  return {
    id: crypto.randomUUID(),
    userId,
    channelType: "email",
    name: DEFAULT_EMAIL_ENDPOINT_NAME,
    enabled: true,
    config: JSON.stringify({ email }),
    createdAt: now,
    updatedAt: now,
  };
}
