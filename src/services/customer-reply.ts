import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { products, tickets, replies, filteredInputs } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { badRequest, conflict, notFound, ApiError } from "@/lib/api/response";
import type { CustomerContext } from "@/lib/api/handler";
import type { Database } from "@/lib/db";
import { sanitizeRichHtml, richHtmlToText, richTextIsEmpty } from "@/lib/rich-text";
import { emitTicketEvent } from "@/services/ticket-events";
import { resolveProductLanguage } from "@/lib/product-language";
import { enforceCustomerIntake, loadSpamTicketContext } from "@/services/email/spam-filter";
import { prepareReplyTranslation } from "@/services/ticket-translation";
import { guardedTicketChange } from "@/lib/tickets/guarded-change";
import type { IntakeRelease } from "./intake-release";

export const replySchema = z.object({
  content: z.string().max(50_000).default(""),
  /** Optional sanitized rich-text rendering of the reply. */
  contentHtml: z.string().max(100_000).optional(),
  turnstileToken: z.string().optional(),
});


export async function addCustomerReply(db: Database, customer: CustomerContext["customer"], ticket: typeof tickets.$inferSelect, body: z.infer<typeof replySchema>, language: "en" | "zh" | { requested: string | null; accept: string | null; errorLanguage: "en" | "zh" }, release?: IntakeRelease) {
  if (ticket.status === TicketStatus.Closed) throw badRequest("This ticket is closed and no longer accepts replies");
  const now = new Date().toISOString();
  const replyId = release?.id ?? crypto.randomUUID();
  const reopen = ticket.status === TicketStatus.Replied;
  // Rich text is re-sanitized server-side before it is stored or rendered.
  const contentHtml = body.contentHtml
    ? sanitizeRichHtml(body.contentHtml) || null
    : null;
  const content =
    body.content.trim() || (contentHtml ? richHtmlToText(contentHtml) : "");
  if (!content && !(contentHtml && !richTextIsEmpty(contentHtml))) {
    throw badRequest("Reply content is required");
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  if (!product) throw notFound("Product not found");
  const sourceLanguage = resolveProductLanguage(product, typeof language === "string" ? language : language.requested, typeof language === "string" ? undefined : language.accept);
  if (!release) await enforceCustomerIntake(db, {
    messageId: "", fromEmail: customer.email ?? "", toEmail: "", subject: ticket.subject, content, kind: "reply",
    ticketContext: await loadSpamTicketContext(db, product.id, ticket.id),
  }, { tenantId: product.tenantId, productId: product.id }, {
    customerId: customer.sub, ticketId: ticket.id, contentHtml, language: sourceLanguage,
  });
  let translation: Awaited<ReturnType<typeof prepareReplyTranslation>>;
  try {
    translation = await prepareReplyTranslation(db, product, {
      content,
      contentHtml,
      sourceLanguage,
      targetLanguage: product.defaultLanguage,
    });
  } catch (error) {
    console.error("Customer reply translation failed:", error);
    throw new ApiError(503, "Reply translation is temporarily unavailable");
  }

  const changed = await guardedTicketChange(db, ticket, {
    ...(!ticket.customerLanguage && { customerLanguage: sourceLanguage }),
    ...(reopen ? { status: TicketStatus.Processing, slaReplyDeadline: null } : {}), updatedAt: now,
  }, {
    actorId: release?.actorId, action: "customer_replied", createdAt: now,
    snapshot: JSON.stringify({ source: "web", ...(release && { released: true, filteredInputId: release.id, reason: release.reason }) }),
  }, (applied) => [
    db.insert(replies).select(db.select({
      id: sql<string>`${replyId}`.as("id"),
      ticketId: tickets.id,
      senderId: sql<null>`NULL`.as("sender_id"),
      senderEmail: sql<string | null>`${customer.email ?? null}`.as("sender_email"),
      content: sql<string>`${content}`.as("content"),
      contentHtml: sql<string | null>`${contentHtml}`.as("content_html"),
      detectedLanguage: sql<string | null>`${translation.detectedLanguage}`.as("detected_language"),
      translations: sql<string | null>`${translation.translations}`.as("translations"),
      internal: sql<boolean>`0`.as("internal"),
      source: sql<"web">`'web'`.as("source"),
      sourceEmailId: sql<null>`NULL`.as("source_email_id"),
      emailSent: sql<boolean>`0`.as("email_sent"),
      createdAt: sql<string>`${now}`.as("created_at"),
    }).from(tickets).where(and(eq(tickets.id, ticket.id), applied))),
    ...(release ? [db.update(filteredInputs).set({ restoredTicketId: ticket.id, restoredReplyId: replyId, releasedAt: now, releasedBy: release.actorId, releaseReason: release.reason }).where(and(eq(filteredInputs.id, release.id), applied))] : []),
  ]);
  if (!changed) throw conflict("Ticket changed; refresh and try again");

  emitTicketEvent(db, {
    type: "customer_replied",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
    customerEmail: customer.email,
  });

  return {
    replyId,
    status: reopen ? TicketStatus.Processing : ticket.status,
    createdAt: now,
  };
}
