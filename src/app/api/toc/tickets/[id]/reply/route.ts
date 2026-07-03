import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, replies, history } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, err, badRequest } from "@/lib/api/response";
import { withCustomerAuth, parseBody } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { emitTicketEvent } from "@/services/ticket-events";

const replySchema = z.object({
  content: z.string().min(1).max(50_000),
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
    return err("CAPTCHA verification failed", 400, captcha.errorCodes);
  }

  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();
  const reopen = ticket.status === TicketStatus.Replied;

  await ctx.db.batch([
    ctx.db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderEmail: ctx.customer.email,
      content: body.content,
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
        ...(reopen ? { status: TicketStatus.Processing } : {}),
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
