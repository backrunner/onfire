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

export interface SendEmailOptions {
  ticketId: string;
  templateType: "ticket_created" | "ticket_replied" | "ticket_closed" | "ticket_escalated";
  replyId?: string;
}

export async function sendTicketNotification(
  db: Database,
  options: SendEmailOptions
): Promise<void> {
  const { ticketId, templateType, replyId } = options;

  // Get ticket
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  // Get email config for product
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, ticket.productId),
  });

  if (!config?.outboundEnabled) {
    console.log(`Outbound email not enabled for product: ${ticket.productId}`);
    return;
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
    template?.subjectTemplate || `[Ticket #{{ticket_id}}] {{subject}}`;
  const bodyTemplate =
    template?.bodyTemplate ||
    `<p>Hello {{customer_name}},</p><p>{{reply_content}}</p>`;

  const subject = replaceVariables(subjectTemplate, variables);
  const bodyHtml = replaceVariables(bodyTemplate, variables);

  // Log outbound email
  const now = new Date().toISOString();
  await db.insert(outboundEmails).values({
    id: crypto.randomUUID(),
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

  // TODO: Actually send email via provider
  console.log(`Email queued for ${ticket.customerEmail}: ${subject}`);
}

function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || "");
}
