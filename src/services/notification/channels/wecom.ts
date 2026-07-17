import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { messageText, postWebhookJson, webhookFailure } from "./webhook-utils";

interface WeComResponse {
  errcode?: number;
  errmsg?: string;
}

export class WeComChannel implements NotificationChannel {
  name = "wecom";

  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const { response, text } = await postWebhookJson(this.webhookUrl, {
        msgtype: "markdown",
        markdown: {
          content: messageText(`**${message.title}**`, message.body, message.url),
        },
      });
      let data: WeComResponse = {};
      try {
        data = JSON.parse(text) as WeComResponse;
      } catch {
        /* handled by HTTP result */
      }
      return response.ok && data.errcode === 0
        ? { success: true }
        : webhookFailure(response, data.errmsg || text);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
