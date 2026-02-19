import type { Database } from "@/lib/db";
import {
  emailConfigs,
  inboundEmails,
  tickets,
  replies,
  customers,
  products,
  tenants,
} from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { pickAssignee } from "@/services/allocation";

export interface InboundEmailPayload {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  messageId?: string;
  spfResult?: string;
  dkimResult?: boolean;
  isSpam?: boolean;
}

export interface ProcessResult {
  success: boolean;
  action: "ticket_created" | "reply_added" | "rejected" | "error";
  ticketId?: string;
  replyId?: string;
  reason?: string;
}

export async function processInboundEmail(
  db: Database,
  payload: InboundEmailPayload
): Promise<ProcessResult> {
  const {
    fromEmail,
    fromName,
    toEmail,
    subject,
    bodyPlain,
    bodyHtml,
    messageId,
    spfResult,
    dkimResult,
    isSpam,
  } = payload;

  // Find email config by inbound address
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.inboundAddress, toEmail),
  });

  if (!config) {
    return {
      success: false,
      action: "rejected",
      reason: `No email config found for address: ${toEmail}`,
    };
  }

  if (!config.inboundEnabled) {
    return {
      success: false,
      action: "rejected",
      reason: "Inbound email not enabled for this product",
    };
  }

  const now = new Date().toISOString();
  const emailId = crypto.randomUUID();

  // Log inbound email
  await db.insert(inboundEmails).values({
    id: emailId,
    productId: config.productId,
    fromEmail,
    fromName: fromName || null,
    toEmail,
    subject: subject || null,
    bodyPlain: bodyPlain || null,
    bodyHtml: bodyHtml || null,
    messageId: messageId || crypto.randomUUID(),
    provider: config.inboundProvider || "generic",
    spfResult: spfResult || null,
    dkimResult: dkimResult ?? null,
    isSpam: isSpam ?? false,
    processingStatus: "pending",
    createdAt: now,
  });

  // Check for spam
  if (isSpam) {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "filtered", filterResult: "spam", processedAt: now })
      .where(eq(inboundEmails.id, emailId));

    return {
      success: false,
      action: "rejected",
      reason: "Email marked as spam",
    };
  }

  // Check SPF/DKIM if strict mode
  if (config.aiFilterStrictness === "high") {
    if (spfResult && spfResult !== "pass") {
      await db
        .update(inboundEmails)
        .set({ processingStatus: "filtered", filterResult: "spf_failed", processedAt: now })
        .where(eq(inboundEmails.id, emailId));

      return {
        success: false,
        action: "rejected",
        reason: `SPF check failed: ${spfResult}`,
      };
    }
  }

  // Check if this is a reply to an existing ticket
  const ticketIdMatch = subject.match(/\[Ticket #([a-zA-Z0-9-]+)\]/);
  if (ticketIdMatch) {
    const ticketId = ticketIdMatch[1];
    const existingTicket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (existingTicket && existingTicket.customerEmail === fromEmail) {
      // Add reply to existing ticket
      const replyId = crypto.randomUUID();
      const content = bodyPlain || stripHtml(bodyHtml || "");

      await db.insert(replies).values({
        id: replyId,
        ticketId,
        senderEmail: fromEmail,
        content,
        source: "email",
        sourceEmailId: emailId,
        createdAt: now,
      });

      // Update ticket status if it was replied/closed
      if (
        existingTicket.status === TicketStatus.Replied ||
        existingTicket.status === TicketStatus.Closed
      ) {
        await db
          .update(tickets)
          .set({
            status: TicketStatus.Processing,
            updatedAt: now,
          })
          .where(eq(tickets.id, ticketId));
      }

      await db
        .update(inboundEmails)
        .set({
          processingStatus: "processed",
          ticketId,
          replyId,
          processedAt: now,
        })
        .where(eq(inboundEmails.id, emailId));

      return {
        success: true,
        action: "reply_added",
        ticketId,
        replyId,
      };
    }
  }

  // Create new ticket
  const product = await db.query.products.findFirst({
    where: eq(products.id, config.productId),
  });

  if (!product) {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "error", errorMessage: "Product not found", processedAt: now })
      .where(eq(inboundEmails.id, emailId));

    return {
      success: false,
      action: "error",
      reason: "Product not found",
    };
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, product.tenantId),
  });

  if (!tenant) {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "error", errorMessage: "Tenant not found", processedAt: now })
      .where(eq(inboundEmails.id, emailId));

    return {
      success: false,
      action: "error",
      reason: "Tenant not found",
    };
  }

  // Find or create customer
  let customer = await db.query.customers.findFirst({
    where: and(
      eq(customers.email, fromEmail),
      eq(customers.productId, config.productId)
    ),
  });

  if (!customer) {
    const customerId = crypto.randomUUID();
    await db.insert(customers).values({
      id: customerId,
      tenantId: product.tenantId,
      productId: config.productId,
      email: fromEmail,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Choose assignee
  const teamId = tenant.defaultTeamId || "";
  const assignee = teamId
    ? await pickAssignee(db, teamId)
    : null;

  // Create ticket
  const ticketId = crypto.randomUUID();
  const content = bodyPlain || stripHtml(bodyHtml || "");

  await db.insert(tickets).values({
    id: ticketId,
    tenantId: product.tenantId,
    productId: config.productId,
    teamId: teamId || "default",
    assigneeId: assignee?.id || null,
    status: TicketStatus.New,
    priority: TicketPriority.Medium,
    subject: subject || "No Subject",
    content,
    customerEmail: fromEmail,
    source: "email",
    sourceEmailId: emailId,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(inboundEmails)
    .set({
      processingStatus: "processed",
      ticketId,
      processedAt: now,
    })
    .where(eq(inboundEmails.id, emailId));

  return {
    success: true,
    action: "ticket_created",
    ticketId,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
