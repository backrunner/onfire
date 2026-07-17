import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { readResponseText } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class NtfyChannel implements NotificationChannel {
  name = "ntfy";
  private serverUrl: string;
  private topic: string;

  constructor(serverUrl: string, topic: string) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.topic = topic;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const response = await fetchWithTimeout(`${this.serverUrl}/${this.topic}`, {
        method: "POST",
        redirect: "error",
        headers: {
          "Title": message.title,
          "Priority": "default",
          "Tags": "ticket",
          ...(message.url ? { "Click": message.url } : {}),
        },
        body: message.body,
      });

      if (!response.ok) {
        const text = await readResponseText(response);
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
