import type { Database } from "@/lib/db";
import {
  emailConfigs,
  inboundEmails,
  tickets,
  replies,
  history,
  customers,
  products,
  tenants,
} from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { pickAssignee } from "@/services/allocation";
import { computeSlaDeadlines } from "@/lib/tickets/sla";
import { emitTicketEvent } from "@/services/ticket-events";
import {
  classifyInboundEmail,
  shouldRejectEmail,
} from "@/services/ai/email-filter";

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
  action: "ticket_created" | "reply_added" | "rejected" | "duplicate" | "error";
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

  // Deduplicate by provider message ID — email webhooks retry on timeouts,
  // and a duplicate delivery must not create a second ticket.
  if (messageId) {
    const existing = await db.query.inboundEmails.findFirst({
      where: and(
        eq(inboundEmails.productId, config.productId),
        eq(inboundEmails.messageId, messageId)
      ),
    });
    if (existing) {
      return {
        success: true,
        action: "duplicate",
        ticketId: existing.ticketId ?? undefined,
        replyId: existing.replyId ?? undefined,
        reason: "Message already processed",
      };
    }
  }

  const now = new Date().toISOString();
  const emailId = crypto.randomUUID();
  const content = bodyPlain || stripHtml(bodyHtml || "");

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

  const markFiltered = async (filterResult: string, reason: string): Promise<ProcessResult> => {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "filtered", filterResult, processedAt: now })
      .where(eq(inboundEmails.id, emailId));
    return { success: false, action: "rejected", reason };
  };

  if (isSpam) {
    return markFiltered("spam", "Email marked as spam by provider");
  }

  // Strict mode: require passing SPF / DKIM when results were provided
  if (config.aiFilterStrictness === "high") {
    if (spfResult && spfResult !== "pass") {
      return markFiltered("spf_failed", `SPF check failed: ${spfResult}`);
    }
    if (dkimResult === false) {
      return markFiltered("dkim_failed", "DKIM check failed");
    }
  }

  // Reply detection: "[Ticket #<id>]" in the subject appends to the thread
  const ticketIdMatch = subject.match(/\[Ticket #([a-zA-Z0-9-]+)\]/);
  if (ticketIdMatch) {
    const ticketId = ticketIdMatch[1];
    const existingTicket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (
      existingTicket &&
      existingTicket.productId === config.productId &&
      existingTicket.customerEmail.toLowerCase() === fromEmail.toLowerCase()
    ) {
      const replyId = crypto.randomUUID();

      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db.insert(replies).values({
          id: replyId,
          ticketId,
          senderEmail: fromEmail,
          content,
          source: "email" as const,
          sourceEmailId: emailId,
          createdAt: now,
        }),
        db.insert(history).values({
          id: crypto.randomUUID(),
          ticketId,
          action: "customer_replied",
          snapshot: JSON.stringify({ source: "email" }),
          createdAt: now,
        }),
        db
          .update(inboundEmails)
          .set({
            processingStatus: "processed",
            ticketId,
            replyId,
            processedAt: now,
          })
          .where(eq(inboundEmails.id, emailId)),
      ];

      // Customer reply reopens replied tickets; closed tickets stay closed
      // per lifecycle, but we still record the reply for the thread.
      if (existingTicket.status === TicketStatus.Replied) {
        statements.push(
          db
            .update(tickets)
            .set({ status: TicketStatus.Processing, updatedAt: now })
            .where(eq(tickets.id, ticketId))
        );
      }

      await db.batch(statements);

      emitTicketEvent(db, {
        type: "customer_replied",
        ticketId,
        agentId: existingTicket.assigneeId ?? undefined,
        customerEmail: fromEmail,
      });

      return { success: true, action: "reply_added", ticketId, replyId };
    }
  }

  // AI filter (best-effort): drop spam / non-support mail before ticket creation
  if (config.aiFilterEnabled) {
    const classification = await classifyInboundEmail(db, {
      fromEmail,
      subject,
      content,
    });
    if (
      classification &&
      shouldRejectEmail(
        classification,
        config.aiFilterStrictness ?? "medium"
      )
    ) {
      return markFiltered(
        JSON.stringify(classification),
        `Filtered by AI: ${classification.reason}`
      );
    }
  }

  const markError = async (reason: string): Promise<ProcessResult> => {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "error", errorMessage: reason, processedAt: now })
      .where(eq(inboundEmails.id, emailId));
    return { success: false, action: "error", reason };
  };

  const product = await db.query.products.findFirst({
    where: eq(products.id, config.productId),
  });
  if (!product) return markError("Product not found");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, product.tenantId),
  });
  if (!tenant) return markError("Tenant not found");

  const teamId = tenant.defaultTeamId;
  if (!teamId) {
    return markError("No default team configured for tenant — cannot route email ticket");
  }

  // Find or create customer
  const customer = await db.query.customers.findFirst({
    where: and(
      eq(customers.email, fromEmail),
      eq(customers.productId, config.productId)
    ),
  });
  if (!customer) {
    await db.insert(customers).values({
      id: crypto.randomUUID(),
      tenantId: product.tenantId,
      productId: config.productId,
      email: fromEmail,
      createdAt: now,
      updatedAt: now,
    });
  }

  const assignee = await pickAssignee(db, teamId);
  const priority = TicketPriority.Medium;
  const sla = computeSlaDeadlines(product, priority, new Date(now));

  const ticketId = crypto.randomUUID();

  await db.batch([
    db.insert(tickets).values({
      id: ticketId,
      tenantId: product.tenantId,
      productId: config.productId,
      teamId,
      assigneeId: assignee?.id || null,
      status: assignee ? TicketStatus.Processing : TicketStatus.New,
      priority,
      subject: subject || "No Subject",
      content,
      customerEmail: fromEmail,
      customerLevel: customer?.level ?? null,
      source: "email",
      sourceEmailId: emailId,
      ...sla,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId,
      action: "created",
      snapshot: JSON.stringify({ source: "email" }),
      createdAt: now,
    }),
    db
      .update(inboundEmails)
      .set({ processingStatus: "processed", ticketId, processedAt: now })
      .where(eq(inboundEmails.id, emailId)),
  ]);

  emitTicketEvent(db, {
    type: "ticket_created",
    ticketId,
    customerEmail: fromEmail,
  });
  if (assignee) {
    emitTicketEvent(db, {
      type: "ticket_assigned",
      ticketId,
      agentId: assignee.id,
    });
  }

  return { success: true, action: "ticket_created", ticketId };
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
