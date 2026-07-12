import type { EmailProvider, EmailMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class ResendProvider implements EmailProvider {
  name = "resend";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: message.fromName
            ? `${message.fromName} <${message.from}>`
            : message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
          headers: message.headers,
        }),
      }, 15_000);

      const data = await readResponseJson<{ id?: string; message?: string }>(
        response
      );

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        messageId: data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
