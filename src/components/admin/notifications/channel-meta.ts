"use client";

import {
  BellRing,
  Mail,
  MessageSquare,
  Radio,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { CHANNEL_TYPES, TRIGGER_EVENTS } from "@/lib/notifications/channel-schema";

export { CHANNEL_TYPES, TRIGGER_EVENTS };

export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

/** Notification channel as returned by the ToB admin API (config parsed). */
export interface ChannelView {
  id: string;
  productId: string;
  channelType: ChannelType;
  name: string;
  enabled: boolean | null;
  config: Record<string, unknown>;
  triggerEvents: string[];
  createdAt: string;
  updatedAt: string;
}

export const CHANNEL_ICONS: Record<ChannelType, LucideIcon> = {
  email: Mail,
  pushdeer: BellRing,
  bark: Smartphone,
  ntfy: Radio,
  telegram: Send,
  discord: MessageSquare,
};

export interface ChannelFieldMeta {
  /** Config object key — must match what the notification service reads. */
  key: "email" | "pushkey" | "deviceKey" | "topic" | "botToken" | "chatId" | "webhookUrl" | "serverUrl";
  required: boolean;
  placeholder?: string;
  secret?: boolean;
}

/** Per-type config fields; keys mirror src/services/notification/channels. */
export const CHANNEL_FIELDS: Record<ChannelType, ChannelFieldMeta[]> = {
  email: [
    { key: "email", required: true, placeholder: "alerts@example.com" },
  ],
  pushdeer: [
    { key: "pushkey", required: true, secret: true },
    { key: "serverUrl", required: false, placeholder: "https://api2.pushdeer.com" },
  ],
  bark: [
    { key: "deviceKey", required: true, secret: true },
    { key: "serverUrl", required: false, placeholder: "https://api.day.app" },
  ],
  ntfy: [
    { key: "topic", required: true },
    { key: "serverUrl", required: false, placeholder: "https://ntfy.sh" },
  ],
  telegram: [
    { key: "botToken", required: true, secret: true },
    { key: "chatId", required: true },
  ],
  discord: [
    {
      key: "webhookUrl",
      required: true,
      placeholder: "https://discord.com/api/webhooks/...",
    },
  ],
};
