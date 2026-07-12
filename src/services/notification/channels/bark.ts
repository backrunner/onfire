import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class BarkChannel implements NotificationChannel {
  name = "bark";
  private serverUrl: string;
  private deviceKey: string;

  constructor(serverUrl: string, deviceKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.deviceKey = deviceKey;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const url = `${this.serverUrl}/${encodeURIComponent(this.deviceKey)}/${encodeURIComponent(message.title)}/${encodeURIComponent(message.body)}`;

      const params = new URLSearchParams();
      if (message.url) {
        params.set("url", message.url);
      }
      params.set("group", "OnFire");
      params.set("sound", "minuet");

      const response = await fetchWithTimeout(`${url}?${params.toString()}`);
      const data = await readResponseJson<{ code?: number; message?: string }>(
        response
      );

      if (data.code !== 200) {
        return { success: false, error: data.message || "Unknown error" };
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
