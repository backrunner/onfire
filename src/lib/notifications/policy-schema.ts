import { z } from "zod";
import type {
  NotificationRequirementRow,
  NotificationRuleRow,
} from "@/drizzle/schema";
import {
  CHANNEL_TYPES,
  RECIPIENT_TYPES,
  REQUIREMENT_SCOPE_TYPES,
  TRIGGER_EVENTS,
} from "./channel-definitions";

export const notificationChannelTypesSchema = z
  .array(z.enum(CHANNEL_TYPES))
  .min(1);
export const notificationTriggerEventsSchema = z
  .array(z.enum(TRIGGER_EVENTS))
  .min(1);
export const notificationRecipientTypeSchema = z.enum(RECIPIENT_TYPES);
export const notificationRequirementScopeSchema = z.enum(
  REQUIREMENT_SCOPE_TYPES
);

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function toNotificationRuleView(row: NotificationRuleRow) {
  return {
    ...row,
    triggerEvents: parseStringArray(row.triggerEvents),
    channelTypes: parseStringArray(row.channelTypes),
  };
}

export function toNotificationRequirementView(
  row: NotificationRequirementRow
) {
  return {
    ...row,
    triggerEvents: parseStringArray(row.triggerEvents),
    channelTypes: parseStringArray(row.channelTypes),
  };
}
