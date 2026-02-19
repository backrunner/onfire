export interface NotificationMessage {
  title: string;
  body: string;
  url?: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface NotificationChannel {
  name: string;
  send(message: NotificationMessage): Promise<SendResult>;
}

export type ChannelType = "email" | "pushdeer" | "bark" | "ntfy" | "telegram" | "discord";

export interface ChannelConfig {
  type: ChannelType;
  config: Record<string, string>;
}

export async function createChannel(channelConfig: ChannelConfig): Promise<NotificationChannel> {
  switch (channelConfig.type) {
    case "pushdeer":
      const { PushdeerChannel } = await import("./pushdeer");
      return new PushdeerChannel(channelConfig.config.pushkey || "");
    case "bark":
      const { BarkChannel } = await import("./bark");
      return new BarkChannel(
        channelConfig.config.serverUrl || "https://api.day.app",
        channelConfig.config.deviceKey || ""
      );
    case "ntfy":
      const { NtfyChannel } = await import("./ntfy");
      return new NtfyChannel(
        channelConfig.config.serverUrl || "https://ntfy.sh",
        channelConfig.config.topic || ""
      );
    case "telegram":
      const { TelegramChannel } = await import("./telegram");
      return new TelegramChannel(
        channelConfig.config.botToken || "",
        channelConfig.config.chatId || ""
      );
    case "discord":
      const { DiscordChannel } = await import("./discord");
      return new DiscordChannel(channelConfig.config.webhookUrl || "");
    case "email":
      const { EmailChannel } = await import("./email");
      return new EmailChannel(channelConfig.config.email || "");
    default:
      throw new Error(`Unknown channel type: ${channelConfig.type}`);
  }
}
