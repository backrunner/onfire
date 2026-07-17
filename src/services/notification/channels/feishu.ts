import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import {
  hmacSha256Base64,
  postWebhookJson,
  webhookFailure,
} from "./webhook-utils";

interface FeishuResponse {
  code?: number;
  StatusCode?: number;
  msg?: string;
  StatusMessage?: string;
}

export class FeishuChannel implements NotificationChannel {
  name = "feishu";

  constructor(
    private webhookUrl: string,
    private signingSecret?: string
  ) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const signature = this.signingSecret
        ? await hmacSha256Base64(`${timestamp}\n${this.signingSecret}`, "")
        : undefined;
      const { response, text } = await postWebhookJson(this.webhookUrl, {
        ...(signature && { timestamp, sign: signature }),
        msg_type: "interactive",
        card: {
          header: { title: { tag: "plain_text", content: message.title } },
          elements: [
            { tag: "div", text: { tag: "lark_md", content: message.body } },
            ...(message.url
              ? [
                  {
                    tag: "action",
                    actions: [
                      {
                        tag: "button",
                        text: { tag: "plain_text", content: "Open ticket" },
                        url: message.url,
                        type: "primary",
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      });
      let data: FeishuResponse = {};
      try {
        data = JSON.parse(text) as FeishuResponse;
      } catch {
        /* handled by HTTP result */
      }
      const code = data.code ?? data.StatusCode;
      return response.ok && (code === undefined || code === 0)
        ? { success: true }
        : webhookFailure(response, data.msg || data.StatusMessage || text);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
