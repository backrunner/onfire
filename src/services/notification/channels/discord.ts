import type { NotificationChannel, NotificationMessage, SendResult } from "./index";

export class DiscordChannel implements NotificationChannel {
  name = "discord";
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: text || `HTTP ${response.status}` };
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
