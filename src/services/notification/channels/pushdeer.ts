import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class PushdeerChannel implements NotificationChannel {
  name = "pushdeer";
  private pushkey: string;
  private serverUrl: string;

  constructor(pushkey: string, serverUrl = "https://api2.pushdeer.com") {
    this.pushkey = pushkey;
    this.serverUrl = serverUrl.replace(/\/$/, "");
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const response = await fetchWithTimeout(`${this.serverUrl}/message/push`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          pushkey: this.pushkey,
          text: message.title,
          desp: message.body,
          type: "markdown",
        }),
      });

      const data = await readResponseJson<{ code?: number; error?: string }>(
        response
      );

      if (data.code !== 0) {
        return { success: false, error: data.error || "Unknown error" };
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
