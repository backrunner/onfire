import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history, products } from "@/drizzle/schema";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { isOpen } from "@/lib/tickets/state-machine";
import { computeInitialSlaDeadlines, computeSlaDeadlines } from "@/lib/tickets/sla";

const prioritySchema = z.object({
  priority: z.enum(TicketPriority),
});

/**
 * POST /api/tob/tickets/:id/priority — change priority.
 * SLA deadlines are recomputed from the new priority's policy, anchored at
 * the original creation time so changing priority never extends deadlines
 * for an old ticket.
 */
export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (!isOpen(ticket.status)) {
    throw badRequest("Cannot change priority of a closed ticket");
  }

  const body = await parseBody(req, prioritySchema);
  if (ticket.priority === body.priority) {
    throw badRequest("Priority unchanged");
  }

  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  const slaUpdate = product
    ? ticket.status === TicketStatus.New
      ? computeInitialSlaDeadlines(
          product,
          body.priority,
          false,
          new Date(ticket.createdAt)
        )
      : {
          ...computeSlaDeadlines(product, body.priority, new Date(ticket.createdAt)),
          ...(ticket.status === TicketStatus.Replied
            ? { slaReplyDeadline: null }
            : {}),
        }
    : {};

  const now = new Date().toISOString();

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ priority: body.priority, updatedAt: now, ...slaUpdate })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "priority_changed",
      snapshot: JSON.stringify({
        previousPriority: ticket.priority,
        newPriority: body.priority,
      }),
      createdAt: now,
    }),
  ]);

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
