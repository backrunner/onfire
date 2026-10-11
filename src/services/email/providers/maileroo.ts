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
      // Maileroo generates its own Message-ID and rejects this reserved header.
      // Keep the reply headers so replies can still reference the incoming mail.
      const headers = message.headers
        ? Object.fromEntries(Object.entries(message.headers).filter(([name]) => name.toLowerCase() !== "message-id"))
        : undefined;
      // Maileroo also rewrites the SMTP Message-ID. Retain OnFire's identifier
      // as a thread ancestor: mail clients carry References into their replies,
      // including replies to a portal-created ticket with a changed subject.
      const threadId = Object.entries(message.headers ?? {}).find(([name]) => name.toLowerCase() === "message-id")?.[1];
      if (headers && threadId && /^<[^<>\s]+@[^<>\s]+>$/.test(threadId) && threadId.length <= 256) {
        const referenceKey = Object.keys(headers).find((name) => name.toLowerCase() === "references");
        const references = [...new Set([...(referenceKey ? headers[referenceKey].match(/<[^<>\s]+@[^<>\s]+>/g) ?? [] : []), threadId])];
        if (referenceKey) delete headers[referenceKey];
        while (references.join(" ").length > 768) references.shift();
        headers.References = references.join(" ");
      }
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
          headers,
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

      const referenceId = data.data?.reference_id;
      if (typeof referenceId !== "string" || !/^[a-f0-9]{24}$/i.test(referenceId)) {
        return { success: false, error: "Maileroo returned an invalid reference ID" };
      }

      return {
        success: true,
        messageId: referenceId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
