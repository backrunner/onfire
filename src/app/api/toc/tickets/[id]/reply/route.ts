import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { products, tickets, replies, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, badRequest, notFound, ApiError } from "@/lib/api/response";
import { localizedErr } from "@/lib/api/error-messages";
import { withCustomerAuth, parseBody } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeRichHtml, richHtmlToText, richTextIsEmpty } from "@/lib/rich-text";
import { emitTicketEvent } from "@/services/ticket-events";
import { resolveProductLanguage, requestedTocLanguage } from "@/lib/product-language";
import { prepareReplyTranslation } from "@/services/ticket-translation";

const replySchema = z.object({
  content: z.string().max(50_000).default(""),
  /** Optional sanitized rich-text rendering of the reply. */
  contentHtml: z.string().max(100_000).optional(),
  turnstileToken: z.string().optional(),
});

/**
 * POST /api/toc/tickets/:id/reply — customer reply.
 * Replying to a ticket in "replied" status moves it back to "processing".
 */
export const POST = withCustomerAuth(async (req: NextRequest, ctx) => {
  await enforceRateLimit(
    ctx.db,
    req,
    "toc:reply",
    { limit: 10, windowSeconds: 60 },
    ctx.customer.sub
  );

  const ticket = await loadCustomerTicket(ctx, ctx.params.id);

  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("This ticket is closed and no longer accepts replies");
  }

  const body = await parseBody(req, replySchema);

  const captcha = await verifyTurnstileToken(
    body.turnstileToken,
    req.headers.get("cf-connecting-ip")
  );
  if (!captcha.success) {
    return localizedErr(req, "CAPTCHA verification failed", 400, captcha.errorCodes);
  }

  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();
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

  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  if (!product) throw notFound("Product not found");
  const sourceLanguage = resolveProductLanguage(
    product,
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );
  let translation: Awaited<ReturnType<typeof prepareReplyTranslation>>;
  try {
    translation = await prepareReplyTranslation(ctx.db, product, {
      content,
      contentHtml,
      sourceLanguage,
      targetLanguage: product.defaultLanguage,
    });
  } catch (error) {
    console.error("Customer reply translation failed:", error);
    throw new ApiError(503, "Reply translation is temporarily unavailable");
  }

  await ctx.db.batch([
    ctx.db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderEmail: ctx.customer.email,
      content,
      contentHtml,
      detectedLanguage: translation.detectedLanguage,
      translations: translation.translations,
      source: "web",
      createdAt: now,
    }),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      action: "customer_replied",
      snapshot: JSON.stringify({ source: "web" }),
      createdAt: now,
    }),
    ctx.db
      .update(tickets)
      .set({
        ...(!ticket.customerLanguage && { customerLanguage: sourceLanguage }),
        ...(reopen
          ? {
              status: TicketStatus.Processing,
              // A customer follow-up must not reactivate the completed
              // first-reply SLA from the prior processing cycle.
              slaReplyDeadline: null,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id)),
  ]);

  emitTicketEvent(ctx.db, {
    type: "customer_replied",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
    customerEmail: ctx.customer.email,
  });

  return ok({
    replyId,
    status: reopen ? TicketStatus.Processing : ticket.status,
    createdAt: now,
  });
});
