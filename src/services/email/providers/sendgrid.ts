import type { EmailProvider, EmailMessage, SendResult } from "./index";

export class SendGridProvider implements EmailProvider {
  name = "sendgrid";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: {
            email: message.from,
            name: message.fromName,
          },
          reply_to: message.replyTo ? { email: message.replyTo } : undefined,
          subject: message.subject,
          content: [
            { type: "text/html", value: message.html },
            ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: text || `HTTP ${response.status}`,
        };
      }

      const messageId = response.headers.get("X-Message-Id");
      return {
        success: true,
        messageId: messageId || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
