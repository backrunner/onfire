import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { postWebhookJson, webhookFailure } from "./webhook-utils";

export class DiscordChannel implements NotificationChannel {
  name = "discord";
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const { response, text } = await postWebhookJson(this.webhookUrl, {
        embeds: [
          {
            title: message.title,
            description: message.body,
            color: 0x5865f2, // Discord blurple
            url: message.url,
            footer: {
              text: "OnFire Support",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      });

      if (!response.ok) {
        return webhookFailure(response, text);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
