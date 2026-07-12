import type { EmailProvider, EmailMessage, SendResult } from "./index";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class MailgunProvider implements EmailProvider {
  name = "mailgun";
  private apiKey: string;
  private domain: string;

  constructor(apiKey: string, domain?: string) {
    this.apiKey = apiKey;
    // API key field carries "key:domain" (domain required for the API URL)
    const parts = apiKey.split(":");
    this.domain = domain || parts[1] || "";
    if (parts.length > 1) {
      this.apiKey = parts[0];
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.domain) {
      return {
        success: false,
        error: "Mailgun domain missing — set the API key as 'key:yourdomain.com'",
      };
    }
    try {
      const formData = new FormData();
      formData.append(
        "from",
        message.fromName
          ? `${message.fromName} <${message.from}>`
          : message.from
      );
      formData.append("to", message.to);
      formData.append("subject", message.subject);
      formData.append("html", message.html);
      if (message.text) {
        formData.append("text", message.text);
      }
      if (message.replyTo) {
        formData.append("h:Reply-To", message.replyTo);
      }
      for (const [name, value] of Object.entries(message.headers ?? {})) {
        formData.append(`h:${name}`, value);
      }

      const response = await fetchWithTimeout(
        `https://api.mailgun.net/v3/${this.domain}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
          },
          body: formData,
        },
        15_000
      );

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
