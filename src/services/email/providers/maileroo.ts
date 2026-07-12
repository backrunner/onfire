import type { EmailProvider, EmailMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class MailerooProvider implements EmailProvider {
  name = "maileroo";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetchWithTimeout("https://smtp.maileroo.com/api/v2/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          from: {
            address: message.from,
            display_name: message.fromName,
          },
          to: [{ address: message.to }],
          subject: message.subject,
          html: message.html,
          plain: message.text,
          reply_to: message.replyTo
            ? { address: message.replyTo }
            : undefined,
          headers: message.headers,
        }),
      }, 15_000);

      const data = await readResponseJson<{
        success?: boolean;
        message?: string;
        data?: { reference_id?: string };
        error?: string | { message?: string };
      }>(response);

      if (!response.ok || !data.success) {
        return {
          success: false,
          error:
            (typeof data.error === "string"
              ? data.error
              : data.error?.message) ||
            data.message ||
            `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        messageId: data.data?.reference_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
