export const CHANNEL_TYPES = [
  "email",
  "pushdeer",
  "bark",
  "ntfy",
  "telegram",
  "discord",
  "slack",
  "teams",
  "feishu",
  "dingtalk",
  "wecom",
] as const;

export type NotificationChannelType = (typeof CHANNEL_TYPES)[number];

export type ChannelFieldKey =
  | "email"
  | "pushkey"
  | "deviceKey"
  | "topic"
  | "botToken"
  | "chatId"
  | "webhookUrl"
  | "serverUrl"
  | "signingSecret";

export interface ChannelFieldDefinition {
  key: ChannelFieldKey;
  required: boolean;
  secret?: boolean;
  placeholder?: string;
}

export interface ChannelDefinition {
  type: NotificationChannelType;
  fields: readonly ChannelFieldDefinition[];
}

export const CHANNEL_DEFINITIONS: Record<
  NotificationChannelType,
  ChannelDefinition
> = {
  email: {
    type: "email",
    fields: [{ key: "email", required: true, placeholder: "alerts@example.com" }],
  },
  pushdeer: {
    type: "pushdeer",
    fields: [
      { key: "pushkey", required: true, secret: true },
      {
        key: "serverUrl",
        required: false,
        placeholder: "https://api2.pushdeer.com",
      },
    ],
  },
  bark: {
    type: "bark",
    fields: [
      { key: "deviceKey", required: true, secret: true },
      {
        key: "serverUrl",
        required: false,
        placeholder: "https://api.day.app",
      },
    ],
  },
  ntfy: {
    type: "ntfy",
    fields: [
      { key: "topic", required: true },
      { key: "serverUrl", required: false, placeholder: "https://ntfy.sh" },
    ],
  },
  telegram: {
    type: "telegram",
    fields: [
      { key: "botToken", required: true, secret: true },
      { key: "chatId", required: true },
    ],
  },
  discord: {
    type: "discord",
    fields: [{ key: "webhookUrl", required: true, secret: true }],
  },
  slack: {
    type: "slack",
    fields: [{ key: "webhookUrl", required: true, secret: true }],
  },
  teams: {
    type: "teams",
    fields: [{ key: "webhookUrl", required: true, secret: true }],
  },
  feishu: {
    type: "feishu",
    fields: [
      { key: "webhookUrl", required: true, secret: true },
      { key: "signingSecret", required: false, secret: true },
    ],
  },
  dingtalk: {
    type: "dingtalk",
    fields: [
      { key: "webhookUrl", required: true, secret: true },
      { key: "signingSecret", required: false, secret: true },
    ],
  },
  wecom: {
    type: "wecom",
    fields: [{ key: "webhookUrl", required: true, secret: true }],
  },
};

export const CHANNEL_SECRET_KEYS = [
  "pushkey",
  "deviceKey",
  "botToken",
  "webhookUrl",
  "signingSecret",
] as const satisfies readonly ChannelFieldKey[];

export const TRIGGER_EVENTS = [
  "ticket_created",
  "ticket_assigned",
  "ticket_reassigned",
  "ticket_escalated",
  "ticket_expiring",
  "customer_replied",
  "ticket_closed",
] as const;

export type NotificationTriggerEvent = (typeof TRIGGER_EVENTS)[number];

export const RECIPIENT_TYPES = [
  "assignee",
  "ticket_team",
  "product_agents",
  "team",
  "user",
] as const;

export type NotificationRecipientType = (typeof RECIPIENT_TYPES)[number];

export const REQUIREMENT_SCOPE_TYPES = ["product", "team", "user"] as const;

export type NotificationRequirementScope =
  (typeof REQUIREMENT_SCOPE_TYPES)[number];
