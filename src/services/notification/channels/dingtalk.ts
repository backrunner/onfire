import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import {
  hmacSha256Base64,
  messageText,
  postWebhookJson,
  webhookFailure,
} from "./webhook-utils";

interface DingTalkResponse {
  errcode?: number;
  errmsg?: string;
}

export class DingTalkChannel implements NotificationChannel {
  name = "dingtalk";

  constructor(
    private webhookUrl: string,
    private signingSecret?: string
  ) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      let url = this.webhookUrl;
      if (this.signingSecret) {
        const timestamp = Date.now().toString();
        const sign = await hmacSha256Base64(
          this.signingSecret,
          `${timestamp}\n${this.signingSecret}`
        );
        const parsed = new URL(url);
        parsed.searchParams.set("timestamp", timestamp);
        parsed.searchParams.set("sign", sign);
        url = parsed.toString();
      }
      const { response, text } = await postWebhookJson(url, {
        msgtype: "markdown",
        markdown: {
          title: message.title,
          text: messageText(`### ${message.title}`, message.body, message.url),
        },
      });
      let data: DingTalkResponse = {};
      try {
        data = JSON.parse(text) as DingTalkResponse;
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
