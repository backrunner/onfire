import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { postWebhookJson, webhookFailure } from "./webhook-utils";

export class TeamsChannel implements NotificationChannel {
  name = "teams";

  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const { response, text } = await postWebhookJson(this.webhookUrl, {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            contentUrl: null,
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", text: message.title, weight: "Bolder", wrap: true },
                { type: "TextBlock", text: message.body, wrap: true },
              ],
              actions: message.url
                ? [{ type: "Action.OpenUrl", title: "Open ticket", url: message.url }]
                : [],
            },
          },
        ],
      });
      return response.ok ? { success: true } : webhookFailure(response, text);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
