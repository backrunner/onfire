import type { Database } from "@/lib/db";
import type { NotificationChannel, NotificationMessage, SendResult } from "./index";
import { sendNotificationEmail } from "@/services/email/outbound";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Agent-notification email channel. Delivers through the product's
 * configured outbound email provider, so it requires outbound email to be
 * enabled for the product.
 */
export class EmailChannel implements NotificationChannel {
  name = "email";

  constructor(
    private email: string,
    private db: Database,
    private productId: string
  ) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    if (!this.email) {
      return { success: false, error: "No recipient email configured" };
    }

    const html = `
<p><strong>${escapeHtml(message.title)}</strong></p>
<p style="white-space: pre-wrap;">${escapeHtml(message.body)}</p>
${message.url ? `<p><a href="${escapeHtml(message.url)}">${escapeHtml(message.url)}</a></p>` : ""}
    `.trim();

    const result = await sendNotificationEmail(this.db, this.productId, {
      to: this.email,
      subject: message.title,
      html,
    });

    return {
      success: result.success,
      error: result.error,
    };
  }
}
