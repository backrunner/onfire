import type { EmailProvider, EmailMessage, SendResult } from "./index";

export class MailgunProvider implements EmailProvider {
  name = "mailgun";
  private apiKey: string;
  private domain: string;

  constructor(apiKey: string, domain?: string) {
    this.apiKey = apiKey;
    // Extract domain from API key format: key-xxx:domain.com or just use default
    const parts = apiKey.split(":");
    this.domain = domain || parts[1] || "mg.example.com";
    if (parts.length > 1) {
      this.apiKey = parts[0];
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
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

      const response = await fetch(
        `https://api.mailgun.net/v3/${this.domain}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
          },
          body: formData,
        }
      );

      const data = (await response.json()) as { id?: string; message?: string };

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
