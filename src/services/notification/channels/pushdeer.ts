import type { NotificationChannel, NotificationMessage, SendResult } from "./index";

export class PushdeerChannel implements NotificationChannel {
  name = "pushdeer";
  private pushkey: string;

  constructor(pushkey: string) {
    this.pushkey = pushkey;
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    try {
      const response = await fetch("https://api2.pushdeer.com/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          pushkey: this.pushkey,
          text: message.title,
          desp: message.body,
          type: "markdown",
        }),
      });

      const data = (await response.json()) as { code?: number; error?: string };

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
