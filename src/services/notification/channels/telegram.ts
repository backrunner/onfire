import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class TelegramChannel implements NotificationChannel {
  name = "telegram";
  private botToken: string;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const text = `*${escapeMarkdown(message.title)}*\n\n${escapeMarkdown(message.body)}`;

      const response = await fetchWithTimeout(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: "MarkdownV2",
            disable_web_page_preview: true,
          }),
        }
      );

      const data = await readResponseJson<{ ok?: boolean; description?: string }>(
        response
      );

      if (!data.ok) {
        return { success: false, error: data.description || "Unknown error" };
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

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
