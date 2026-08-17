import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history, products } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { statusTransitionSlaUpdate } from "@/lib/tickets/sla";

const reopenSchema = z.object({
  reason: z.string().max(2000).optional(),
});

/**
 * POST /api/tob/tickets/:id/reopen — reopen a closed ticket as "processing".
 * Restarts the reply SLA when the ticket has an assignee, otherwise clears any
 * stale reply deadline. Customer notification is intentionally not sent.
 */
export const POST = withAuth({ permission: "ticket.close" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (ticket.status !== TicketStatus.Closed) {
    throw badRequest("Only closed tickets can be reopened");
  }

  const body = await parseBody(req, reopenSchema);
  const now = new Date().toISOString();
  const product = ticket.assigneeId
    ? await ctx.db.query.products.findFirst({
        where: eq(products.id, ticket.productId),
      })
    : undefined;
  const slaUpdate = statusTransitionSlaUpdate(
    ticket,
    TicketStatus.Processing,
    product,
    new Date(now)
  );

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ status: TicketStatus.Processing, updatedAt: now, ...slaUpdate })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "reopened",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        reason: body.reason,
      }),
      createdAt: now,
    }),
  ]);

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
