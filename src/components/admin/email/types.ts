/** Client-side view types for the email configuration pages. */

export type InboundProvider =
  | "maileroo"
  | "sendgrid"
  | "mailgun"
  | "cloudflare"
  | "generic";
export type OutboundProvider =
  | "resend"
  | "sendgrid"
  | "mailgun"
  | "maileroo"
  | "cloudflare"
  | "smtp";
export type AiFilterStrictness = "low" | "medium" | "high";

export type { EmailTemplateType } from "@/lib/email-templates";
import type { EmailTemplateType } from "@/lib/email-templates";

export const EMAIL_TEMPLATE_TYPES: EmailTemplateType[] = [
  "ticket_created",
  "ticket_replied",
  "ticket_closed",
  "ticket_escalated",
];

export const TEMPLATE_VARIABLES = [
  "ticket_id",
  "subject",
  "customer_name",
  "customer_email",
  "agent_name",
  "reply_content",
  "product_name",
];

/** GET /api/tob/admin/email-config — secrets exposed as presence flags only. */
export interface EmailConfigView {
  id: string;
  productId: string;
  inboundEnabled: boolean | null;
  inboundProvider: InboundProvider | null;
  inboundAddress: string | null;
  hasWebhookSecret: boolean;
  outboundEnabled: boolean | null;
  outboundProvider: OutboundProvider | null;
  hasOutboundApiKey: boolean;
  outboundSmtpHost: string | null;
  outboundSmtpPort: number | null;
  outboundSmtpUser: string | null;
  hasOutboundSmtpPass: boolean;
  outboundSenderName: string | null;
  outboundSenderEmail: string | null;
  outboundReplyTo: string | null;
  aiFilterEnabled: boolean | null;
  aiFilterStrictness: AiFilterStrictness | null;
  /** True when the global prescreening task has an enabled credential route. */
  aiFilterAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateView {
  id: string;
  productId: string;
  templateType: EmailTemplateType;
  subjectTemplate: string;
  bodyTemplate: string;
  enabled: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundEmailLog {
  id: string;
  messageId: string | null;
  provider: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  processingStatus: string;
  filterResult: string | null;
  filterStage: string | null;
  filterProvider: string | null;
  filterVerdict: string | null;
  filterScore: number | null;
  filterReason: string | null;
  candidateTicketId: string | null;
  ticketId: string | null;
  replyId: string | null;
  errorMessage: string | null;
  spfResult: string | null;
  dkimResult: boolean | null;
  isSpam: boolean | null;
  createdAt: string;
  processedAt: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseReason: string | null;
  releaseTicketTypeId: string | null;
}

export interface OutboundEmailLog {
  id: string;
  ticketId: string | null;
  replyId: string | null;
  toEmail: string;
  fromEmail: string;
  subject: string;
  provider: string | null;
  providerMessageId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}
