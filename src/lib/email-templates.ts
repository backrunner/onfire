export type EmailTemplateType =
  | "ticket_created"
  | "ticket_replied"
  | "ticket_closed"
  | "ticket_escalated";

export type EmailTemplateVariables = Record<
  | "ticket_id"
  | "subject"
  | "customer_name"
  | "customer_email"
  | "agent_name"
  | "reply_content"
  | "product_name",
  string
>;

export const EMAIL_TEMPLATE_SAMPLE_VARIABLES: EmailTemplateVariables = {
  ticket_id: "TKT-2026-0712",
  subject: "Unable to access the analytics dashboard",
  customer_name: "Alex",
  customer_email: "alex@example.com",
  agent_name: "Morgan",
  reply_content:
    "We restored your workspace access. Please sign in again and let us know if the issue continues.",
  product_name: "OnFire",
};

const UNSAFE_EMAIL_BLOCK_TAG = /<(script|iframe|object|embed|form|input|button|textarea|select|video|audio|base|meta|link)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const UNSAFE_EMAIL_SINGLE_TAG = /<\/?(script|iframe|object|embed|form|input|button|textarea|select|video|audio|base|meta|link)\b[^>]*>/gi;
const UNSAFE_EMAIL_EVENT = /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_EMAIL_URL = /\s+(?:href|src|action|formaction)\s*=\s*(?:"\s*(?:javascript|vbscript):[^\"]*"|'\s*(?:javascript|vbscript):[^']*'|\s*(?:javascript|vbscript):[^\s>]+)/gi;

/** Return validation errors for HTML that is unsafe in an email body. */
export function emailTemplateMarkupIssues(template: string): string[] {
  const issues: string[] = [];
  if (UNSAFE_EMAIL_BLOCK_TAG.test(template) || UNSAFE_EMAIL_SINGLE_TAG.test(template)) {
    issues.push("Scripts, forms, embedded documents, and media elements are not allowed");
  }
  UNSAFE_EMAIL_BLOCK_TAG.lastIndex = 0;
  UNSAFE_EMAIL_SINGLE_TAG.lastIndex = 0;
  if (UNSAFE_EMAIL_EVENT.test(template)) {
    issues.push("Inline event handlers are not allowed");
  }
  UNSAFE_EMAIL_EVENT.lastIndex = 0;
  if (UNSAFE_EMAIL_URL.test(template)) {
    issues.push("javascript: and vbscript: URLs are not allowed");
  }
  UNSAFE_EMAIL_URL.lastIndex = 0;
  return issues;
}

/** Strip unsafe legacy markup before rendering an outbound message. */
export function sanitizeEmailTemplateHtml(template: string): string {
  return template
    .replace(UNSAFE_EMAIL_BLOCK_TAG, "")
    .replace(UNSAFE_EMAIL_SINGLE_TAG, "")
    .replace(UNSAFE_EMAIL_EVENT, "")
    .replace(UNSAFE_EMAIL_URL, "");
}

export function getDefaultSubjectTemplate(type: EmailTemplateType): string {
  switch (type) {
    case "ticket_replied":
      return "Re: [Ticket #{{ticket_id}}] {{subject}}";
    case "ticket_closed":
      return "[Closed] Ticket #{{ticket_id}}: {{subject}}";
    case "ticket_escalated":
      return "[Escalated] Ticket #{{ticket_id}}: {{subject}}";
    default:
      return "[Ticket #{{ticket_id}}] {{subject}}";
  }
}

export function getDefaultBodyTemplate(type: EmailTemplateType): string {
  const intro: Record<EmailTemplateType, string> = {
    ticket_created:
      "Thank you for contacting us. Your support ticket has been created and our team will review it shortly.",
    ticket_replied: "{{agent_name}} has replied to your support ticket.",
    ticket_closed:
      "Your support ticket has been closed. You can open a new ticket if you need more help.",
    ticket_escalated:
      "Your support ticket has been escalated to a specialist for further review.",
  };
  const reply =
    type === "ticket_replied"
      ? `<div style="margin:20px 0;padding:16px;border-left:3px solid #18181b;background:#f4f4f5;color:#27272a;line-height:1.6">{{reply_content}}</div>`
      : "";

  return `<div style="margin:0 auto;max-width:600px;padding:32px 24px;background:#ffffff;color:#18181b;font-family:Arial,sans-serif">
  <div style="margin-bottom:24px;font-size:18px;font-weight:700">{{product_name}} Support</div>
  <p style="margin:0 0 16px;line-height:1.6">Hello {{customer_name}},</p>
  <p style="margin:0 0 16px;line-height:1.6">${intro[type]}</p>
  ${reply}
  <div style="margin:24px 0;padding:16px;border:1px solid #e4e4e7;border-radius:8px">
    <div style="margin-bottom:6px;font-size:12px;color:#71717a">Ticket {{ticket_id}}</div>
    <div style="font-weight:600">{{subject}}</div>
  </div>
  <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a">Best regards,<br>{{product_name}} Support Team</p>
</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailTemplate(
  template: string,
  variables: EmailTemplateVariables,
  options: {
    html: boolean;
    /**
     * Pre-sanitized rich HTML values (see sanitizeRichHtml) injected verbatim
     * for these keys in HTML mode instead of the escaped plain value.
     */
    trustedHtml?: Partial<Record<keyof EmailTemplateVariables, string>>;
  }
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const trusted = options.trustedHtml?.[key as keyof EmailTemplateVariables];
    if (options.html && trusted !== undefined) return trusted;
    const value = variables[key as keyof EmailTemplateVariables] ?? "";
    return options.html
      ? escapeHtml(value).replace(/\n/g, "<br>")
      : value.replace(/[\r\n]+/g, " ");
  });
}
