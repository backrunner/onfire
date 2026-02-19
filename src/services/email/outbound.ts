import type { Database } from "@/lib/db";
import {
  emailConfigs,
  emailTemplates,
  outboundEmails,
  tickets,
  replies,
  products,
  agentProfiles,
  users,
} from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createProvider, type ProviderConfig } from "./providers";

export interface SendEmailOptions {
  ticketId: string;
  templateType: "ticket_created" | "ticket_replied" | "ticket_closed" | "ticket_escalated";
  replyId?: string;
}

export async function sendTicketNotification(
  db: Database,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { ticketId, templateType, replyId } = options;

  // Get ticket
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    return { success: false, error: `Ticket not found: ${ticketId}` };
  }

  // Get email config for product
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, ticket.productId),
  });

  if (!config?.outboundEnabled) {
    console.log(`Outbound email not enabled for product: ${ticket.productId}`);
    return { success: false, error: "Outbound email not enabled" };
  }

  // Get template
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.productId, ticket.productId),
  });

  // Get product name
  const product = await db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });

  // Get reply content if applicable
  let replyContent = "";
  let agentName = "";
  if (replyId) {
    const reply = await db.query.replies.findFirst({
      where: eq(replies.id, replyId),
    });
    if (reply) {
      replyContent = reply.content;
      if (reply.senderId) {
        const profile = await db.query.agentProfiles.findFirst({
          where: eq(agentProfiles.userId, reply.senderId),
        });
        if (profile) {
          agentName = profile.displayName;
        } else {
          const user = await db.query.users.findFirst({
            where: eq(users.id, reply.senderId),
          });
          agentName = user?.displayName || "";
        }
      }
    }
  }

  // Build email content
  const variables = {
    ticket_id: ticket.id,
    subject: ticket.subject,
    customer_name: ticket.customerEmail.split("@")[0],
    customer_email: ticket.customerEmail,
    agent_name: agentName,
    reply_content: replyContent,
    product_name: product?.name || "",
  };

  const subjectTemplate =
    template?.subjectTemplate || getDefaultSubjectTemplate(templateType);
  const bodyTemplate =
    template?.bodyTemplate || getDefaultBodyTemplate(templateType);

  const subject = replaceVariables(subjectTemplate, variables);
  const bodyHtml = replaceVariables(bodyTemplate, variables);

  const now = new Date().toISOString();
  const emailId = crypto.randomUUID();

  // Log outbound email as pending
  await db.insert(outboundEmails).values({
    id: emailId,
    productId: ticket.productId,
    ticketId: ticket.id,
    replyId: replyId || null,
    toEmail: ticket.customerEmail,
    fromEmail: config.outboundSenderEmail || "noreply@onfire.app",
    fromName: config.outboundSenderName || "OnFire Support",
    subject,
    bodyHtml,
    provider: config.outboundProvider || "resend",
    status: "pending",
    createdAt: now,
  });

  // Create provider and send
  try {
    const providerConfig: ProviderConfig = {
      type: (config.outboundProvider as ProviderConfig["type"]) || "resend",
      apiKey: config.outboundApiKey || undefined,
      smtpHost: config.outboundSmtpHost || undefined,
      smtpPort: config.outboundSmtpPort || undefined,
      smtpUser: config.outboundSmtpUser || undefined,
      smtpPassword: config.outboundSmtpPass || undefined,
    };

    const provider = await createProvider(providerConfig);
    const result = await provider.send({
      to: ticket.customerEmail,
      from: config.outboundSenderEmail || "noreply@onfire.app",
      fromName: config.outboundSenderName || "OnFire Support",
      replyTo: config.outboundReplyTo || undefined,
      subject,
      html: bodyHtml,
    });

    // Update email status
    await db
      .update(outboundEmails)
      .set({
        status: result.success ? "sent" : "failed",
        providerMessageId: result.messageId || null,
        errorMessage: result.error || null,
        sentAt: result.success ? new Date().toISOString() : null,
      })
      .where(eq(outboundEmails.id, emailId));

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(outboundEmails)
      .set({
        status: "failed",
        errorMessage: errorMessage,
      })
      .where(eq(outboundEmails.id, emailId));

    return { success: false, error: errorMessage };
  }
}

function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || "");
}

function getDefaultSubjectTemplate(
  type: SendEmailOptions["templateType"]
): string {
  switch (type) {
    case "ticket_created":
      return "[Ticket #{{ticket_id}}] {{subject}}";
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

function getDefaultBodyTemplate(
  type: SendEmailOptions["templateType"]
): string {
  switch (type) {
    case "ticket_created":
      return `
<p>Hello {{customer_name}},</p>
<p>Thank you for contacting us. Your support ticket has been created.</p>
<p><strong>Ticket ID:</strong> {{ticket_id}}</p>
<p><strong>Subject:</strong> {{subject}}</p>
<p>Our team will review your request and respond as soon as possible.</p>
<p>Best regards,<br>{{product_name}} Support Team</p>
      `.trim();
    case "ticket_replied":
      return `
<p>Hello {{customer_name}},</p>
<p>{{agent_name}} has replied to your ticket:</p>
<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0;">
{{reply_content}}
</blockquote>
<p>You can reply to this email to continue the conversation.</p>
<p>Best regards,<br>{{product_name}} Support Team</p>
      `.trim();
    case "ticket_closed":
      return `
<p>Hello {{customer_name}},</p>
<p>Your support ticket #{{ticket_id}} has been closed.</p>
<p>If you have any further questions, please feel free to open a new ticket.</p>
<p>Best regards,<br>{{product_name}} Support Team</p>
      `.trim();
    case "ticket_escalated":
      return `
<p>Hello {{customer_name}},</p>
<p>Your support ticket #{{ticket_id}} has been escalated to our senior support team for further assistance.</p>
<p>We will get back to you as soon as possible.</p>
<p>Best regards,<br>{{product_name}} Support Team</p>
      `.trim();
    default:
      return `<p>Hello {{customer_name}},</p><p>{{reply_content}}</p>`;
  }
}
