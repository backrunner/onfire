import type { EmailProvider, EmailMessage, SendResult } from "./index";

export class MailerooProvider implements EmailProvider {
  name = "maileroo";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch("https://smtp.maileroo.com/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          from: message.fromName
            ? `${message.fromName} <${message.from}>`
            : message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          plain: message.text,
          reply_to: message.replyTo,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message_id?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        messageId: data.message_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
