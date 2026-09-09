import type { Database } from "@/lib/db";
import type { NotificationChannelType } from "@/lib/notifications/channel-definitions";

export interface NotificationMessage {
  title: string;
  body: string;
  url?: string;
  logId?: string;
}

export interface SendResult {
  success: boolean;
  queued?: boolean;
  error?: string;
}

export interface NotificationChannel {
  name: string;
  send(message: NotificationMessage): Promise<SendResult>;
}

export type ChannelType = NotificationChannelType;

export interface ChannelConfig {
  type: ChannelType;
  config: Record<string, string>;
}

/** Context the email channel needs to route through the product's provider. */
export interface ChannelContext {
  db: Database;
  productId: string;
}

type ChannelFactory = (
  config: Record<string, string>,
  ctx: ChannelContext
) => Promise<NotificationChannel>;

const CHANNEL_FACTORIES = {
  pushdeer: async (config) => {
    const { PushdeerChannel } = await import("./pushdeer");
    return new PushdeerChannel(
      config.pushkey || "",
      config.serverUrl || "https://api2.pushdeer.com"
    );
  },
  bark: async (config) => {
    const { BarkChannel } = await import("./bark");
    return new BarkChannel(
      config.serverUrl || "https://api.day.app",
      config.deviceKey || ""
    );
  },
  ntfy: async (config) => {
    const { NtfyChannel } = await import("./ntfy");
    return new NtfyChannel(
      config.serverUrl || "https://ntfy.sh",
      config.topic || ""
    );
  },
  telegram: async (config) => {
    const { TelegramChannel } = await import("./telegram");
    return new TelegramChannel(config.botToken || "", config.chatId || "");
  },
  discord: async (config) => {
    const { DiscordChannel } = await import("./discord");
    return new DiscordChannel(config.webhookUrl || "");
  },
  slack: async (config) => {
    const { SlackChannel } = await import("./slack");
    return new SlackChannel(config.webhookUrl || "");
  },
  teams: async (config) => {
    const { TeamsChannel } = await import("./teams");
    return new TeamsChannel(config.webhookUrl || "");
  },
  feishu: async (config) => {
    const { FeishuChannel } = await import("./feishu");
    return new FeishuChannel(config.webhookUrl || "", config.signingSecret);
  },
  dingtalk: async (config) => {
    const { DingTalkChannel } = await import("./dingtalk");
    return new DingTalkChannel(config.webhookUrl || "", config.signingSecret);
  },
  wecom: async (config) => {
    const { WeComChannel } = await import("./wecom");
    return new WeComChannel(config.webhookUrl || "");
  },
  email: async (config, ctx) => {
    const { EmailChannel } = await import("./email");
    return new EmailChannel(config.email || "", ctx.db, ctx.productId);
  },
} satisfies Record<ChannelType, ChannelFactory>;

export async function createChannel(
  channelConfig: ChannelConfig,
  ctx: ChannelContext
): Promise<NotificationChannel> {
  const factory = CHANNEL_FACTORIES[channelConfig.type];
  if (!factory) throw new Error(`Unknown channel type: ${channelConfig.type}`);
  return factory(channelConfig.config, ctx);
}
