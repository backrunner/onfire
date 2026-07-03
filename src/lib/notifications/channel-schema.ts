import { z } from "zod";
import type { NotificationChannelRow } from "@/drizzle/schema";

export const CHANNEL_TYPES = [
  "email",
  "pushdeer",
  "bark",
  "ntfy",
  "telegram",
  "discord",
] as const;

export const TRIGGER_EVENTS = [
  "ticket_created",
  "ticket_assigned",
  "ticket_reassigned",
  "ticket_escalated",
  "ticket_expiring",
  "customer_replied",
  "ticket_closed",
] as const;

export const channelTypeSchema = z.enum(CHANNEL_TYPES);
export const triggerEventsSchema = z.array(z.enum(TRIGGER_EVENTS)).min(1);

export function toChannelView(row: NotificationChannelRow) {
  let config: Record<string, unknown> = {};
  let triggerEvents: string[] = [];
  try {
    config = JSON.parse(row.config || "{}");
  } catch {
    /* keep empty */
  }
  try {
    triggerEvents = JSON.parse(row.triggerEvents || "[]");
  } catch {
    /* keep empty */
  }
  return { ...row, config, triggerEvents };
}
