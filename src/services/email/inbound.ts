import type { Database } from "@/lib/db";
import {
  emailConfigs,
  inboundEmails,
  outboundEmails,
  tickets,
  replies,
  history,
  products,
  tenants,
} from "@/drizzle/schema";
import type { InboundEmailProvider } from "@/drizzle/schema";
import { desc, eq, and, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { pickAssignee } from "@/services/allocation";
import { computeInitialSlaDeadlines } from "@/lib/tickets/sla";
import { emitTicketEvent } from "@/services/ticket-events";
import {
  classifyInboundEmail,
  shouldRejectEmail,
} from "@/services/ai/email-filter";
import { upsertCustomerIdentity } from "@/lib/auth/customer-record";

export interface InboundEmailPayload {
  provider?: InboundEmailProvider;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
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
    provider,
    fromName,
    toEmail,
    subject,
    bodyPlain,
    bodyHtml,
    messageId,
    inReplyTo,
    references,
    spfResult,
    dkimResult,
    isSpam,
  } = payload;

  const normalizedFrom = fromEmail.trim().toLowerCase();
  const normalizedTo = toEmail.trim().toLowerCase();
  const normalizedMessageId = messageId?.trim().slice(0, 998);
  const normalizedSubject = subject.replace(/[\r\n]+/g, " ").trim().slice(0, 998);

  const config = await db.query.emailConfigs.findFirst({
    where: sql`lower(${emailConfigs.inboundAddress}) = ${normalizedTo}`,
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
  if (provider && config.inboundProvider !== provider) {
    return {
      success: false,
      action: "rejected",
      reason: `Inbound provider mismatch: expected ${config.inboundProvider ?? "none"}`,
    };
  }

  // Deduplicate by provider message ID — email webhooks retry on timeouts,
  // and a duplicate delivery must not create a second ticket.
  let existingInbound: typeof inboundEmails.$inferSelect | undefined;
  if (normalizedMessageId) {
    const existing = await db.query.inboundEmails.findFirst({
      where: and(
        eq(inboundEmails.productId, config.productId),
        eq(inboundEmails.messageId, normalizedMessageId)
      ),
    });
    const pendingIsStale =
      existing?.processingStatus === "pending" &&
      Date.now() - new Date(existing.createdAt).getTime() > 5 * 60_000;
    if (
      existing &&
      existing.processingStatus !== "error" &&
      !pendingIsStale
    ) {
      return {
        success: true,
        action: "duplicate",
        ticketId: existing.ticketId ?? undefined,
        replyId: existing.replyId ?? undefined,
        reason: "Message already processed",
      };
    }
    existingInbound = existing;
  }

  const now = new Date().toISOString();
  const emailId = existingInbound?.id ?? crypto.randomUUID();
  // Some providers emit a whitespace-only text part alongside a useful HTML
  // part. Treat that text part as empty instead of discarding the HTML body.
  const normalizedBodyPlain = bodyPlain?.trim() ?? "";
  const content = normalizedBodyPlain || stripHtml(bodyHtml || "");

  const inboundValues = {
    fromEmail: normalizedFrom,
    fromName: fromName || null,
    toEmail: normalizedTo,
    subject: normalizedSubject || null,
    bodyPlain: normalizedBodyPlain || null,
    bodyHtml: bodyHtml || null,
    inReplyTo: inReplyTo || null,
    references: references || null,
    spfResult: spfResult || null,
    dkimResult: dkimResult ?? null,
    isSpam: isSpam ?? false,
    processingStatus: "pending" as const,
    filterResult: null,
    errorMessage: null,
    processedAt: null,
  };
  const duplicateResult = (
    existing: typeof inboundEmails.$inferSelect | undefined
  ): ProcessResult => ({
    success: true,
    action: "duplicate",
    ticketId: existing?.ticketId ?? undefined,
    replyId: existing?.replyId ?? undefined,
    reason: "Message is already being processed or has completed",
  });

  if (existingInbound) {
    const claimed = await db
      .update(inboundEmails)
      .set({ ...inboundValues, createdAt: now })
      .where(
        and(
          eq(inboundEmails.id, emailId),
          eq(inboundEmails.processingStatus, existingInbound.processingStatus),
          eq(inboundEmails.createdAt, existingInbound.createdAt)
        )
      )
      .returning({ id: inboundEmails.id });
    if (claimed.length === 0) return duplicateResult(existingInbound);
  } else {
    const inserted = await db
      .insert(inboundEmails)
      .values({
        id: emailId,
        productId: config.productId,
        messageId: normalizedMessageId || crypto.randomUUID(),
        provider: config.inboundProvider || "generic",
        createdAt: now,
        ...inboundValues,
      })
      .onConflictDoNothing()
      .returning({ id: inboundEmails.id });
    if (inserted.length === 0) {
      const concurrent = normalizedMessageId
        ? await db.query.inboundEmails.findFirst({
            where: and(
              eq(inboundEmails.productId, config.productId),
              eq(inboundEmails.messageId, normalizedMessageId)
            ),
          })
        : undefined;
      return duplicateResult(concurrent);
    }
  }

  try {
    const markFiltered = async (filterResult: string, reason: string): Promise<ProcessResult> => {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "filtered", filterResult, processedAt: now })
      .where(eq(inboundEmails.id, emailId));
    return { success: false, action: "rejected", reason };
    };

    if (!content.trim()) {
      return markFiltered("empty_body", "Email body is empty");
    }

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

  // Prefer RFC threading headers; keep the ticket marker in the subject as a
  // fallback for providers that rewrite or omit Message-ID headers.
  const ticketIdMatch = normalizedSubject.match(/\[Ticket #([a-zA-Z0-9-]+)\]/);
  let replyTicketId = ticketIdMatch?.[1];
  if (!replyTicketId) {
    const threadIds = extractThreadMessageIds(inReplyTo, references);
    if (threadIds.length > 0) {
      const sent = await db
        .select({
          ticketId: outboundEmails.ticketId,
          providerMessageId: outboundEmails.providerMessageId,
        })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.productId, config.productId),
            eq(outboundEmails.status, "sent"),
            inArray(outboundEmails.providerMessageId, threadIds)
          )
        )
        .orderBy(desc(outboundEmails.createdAt))
        .limit(1);
      replyTicketId = sent[0]?.ticketId ?? undefined;
    }
  }

  if (replyTicketId) {
    const ticketId = replyTicketId;
    const existingTicket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (
      existingTicket &&
      existingTicket.productId === config.productId &&
      existingTicket.customerEmail?.toLowerCase() === normalizedFrom
    ) {
      if (existingTicket.status === TicketStatus.Closed) {
        return markFiltered("ticket_closed", "Closed tickets do not accept replies");
      }
      const replyId = crypto.randomUUID();

      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db.insert(replies).values({
          id: replyId,
          ticketId,
          senderEmail: normalizedFrom,
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

      // Customer reply reopens a ticket that was waiting on the customer.
      if (existingTicket.status === TicketStatus.Replied) {
        statements.push(
          db
            .update(tickets)
            .set({
              status: TicketStatus.Processing,
              // The first-reply SLA was completed before this customer reply;
              // never reactivate a stale deadline on the reopened ticket.
              slaReplyDeadline: null,
              updatedAt: now,
            })
            .where(eq(tickets.id, ticketId))
        );
      }

      await db.batch(statements);

      emitTicketEvent(db, {
        type: "customer_replied",
        ticketId,
        agentId: existingTicket.assigneeId ?? undefined,
        customerEmail: normalizedFrom,
      });

      return { success: true, action: "reply_added", ticketId, replyId };
    }
  }

  // AI filter (best-effort): drop spam / non-support mail before ticket creation
  if (config.aiFilterEnabled) {
    const classification = await classifyInboundEmail(db, {
      fromEmail: normalizedFrom,
      subject: normalizedSubject,
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

  const customer = await upsertCustomerIdentity(db, product, {
    email: normalizedFrom,
  });

  const assignee = await pickAssignee(db, teamId);
  const priority = TicketPriority.Medium;
  const sla = computeInitialSlaDeadlines(
    product,
    priority,
    Boolean(assignee),
    new Date(now)
  );

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
      subject: normalizedSubject || "No Subject",
      content,
      customerId: customer.id,
      customerEmail: normalizedFrom,
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
    customerEmail: normalizedFrom,
  });
  if (assignee) {
    emitTicketEvent(db, {
      type: "ticket_assigned",
      ticketId,
      agentId: assignee.id,
    });
  }

  return { success: true, action: "ticket_created", ticketId };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 2_000) : "Unknown error";
    console.error(
      JSON.stringify({
        event: "inbound_email_pipeline_failed",
        emailId,
        productId: config.productId,
        error: detail,
      })
    );
    await db
      .update(inboundEmails)
      .set({
        processingStatus: "error",
        errorMessage: detail,
        processedAt: new Date().toISOString(),
      })
      .where(eq(inboundEmails.id, emailId));
    return {
      success: false,
      action: "error",
      reason: "Inbound email processing failed",
    };
  }
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

export function extractThreadMessageIds(
  inReplyTo?: string,
  references?: string
): string[] {
  const values = [inReplyTo, ...(references?.match(/<[^>]+>/g) ?? [])].filter(
    (value): value is string => Boolean(value?.trim())
  );
  const variants = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    const bare = trimmed.replace(/^</, "").replace(/>$/, "");
    variants.add(trimmed);
    variants.add(bare);
    variants.add(`<${bare}>`);
  }
  return [...variants];
}
