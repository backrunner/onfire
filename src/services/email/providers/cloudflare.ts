import type { EmailProvider, EmailMessage, SendResult } from "./index";
import { getEnv } from "@/lib/db";

/**
 * Cloudflare Email Service provider — sends through the Worker's
 * `send_email` binding (SEND_EMAIL in wrangler.jsonc). No API key needed;
 * the `from` domain must be onboarded to Email Sending first:
 *   npx wrangler email sending enable yourdomain.com
 */
export class CloudflareProvider implements EmailProvider {
  name = "cloudflare";

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const binding = getEnv().SEND_EMAIL;
      const response = await binding.send({
        to: message.to,
        from: message.fromName
          ? { email: message.from, name: message.fromName }
          : message.from,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text || htmlToText(message.html),
        ...(message.headers ? { headers: message.headers } : {}),
      });
      return { success: true, messageId: response.messageId };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : undefined;
      const detail =
        error instanceof Error ? error.message : "Cloudflare email send failed";
      return {
        success: false,
        error: code ? `${code}: ${detail}` : detail,
      };
    }
  }
}

/** Plain-text fallback derived from the HTML body (helps deliverability). */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
