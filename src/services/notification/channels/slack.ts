import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { messageText, postWebhookJson, webhookFailure } from "./webhook-utils";

export class SlackChannel implements NotificationChannel {
  name = "slack";

  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const { response, text } = await postWebhookJson(this.webhookUrl, {
        text: messageText(message.title, message.body, message.url),
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: message.title.slice(0, 150) },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: message.body.slice(0, 3_000) },
          },
          ...(message.url
            ? [
                {
                  type: "section",
                  text: { type: "mrkdwn", text: `<${message.url}|Open ticket>` },
                },
              ]
            : []),
        ],
      });
      return response.ok && text.trim().toLowerCase() === "ok"
        ? { success: true }
        : webhookFailure(response, text);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
