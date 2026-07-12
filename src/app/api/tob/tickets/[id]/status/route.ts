import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, history, products } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import {
  assertManualStatusTarget,
  assertTransition,
} from "@/lib/tickets/state-machine";
import { restartReplySla } from "@/lib/tickets/sla";

const statusSchema = z.object({
  status: z.enum(TicketStatus),
});

export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  const body = await parseBody(req, statusSchema);
  assertManualStatusTarget(body.status);
  assertTransition(ticket.status, body.status);

  const now = new Date().toISOString();
  let slaUpdate: Partial<typeof tickets.$inferInsert> = {};
  if (
    ticket.status === TicketStatus.New &&
    body.status === TicketStatus.Processing
  ) {
    const product = await ctx.db.query.products.findFirst({
      where: eq(products.id, ticket.productId),
    });
    if (product) {
      slaUpdate = restartReplySla(product, ticket.priority, new Date(now));
    }
  } else if (body.status === TicketStatus.Replied) {
    slaUpdate = { slaReplyDeadline: null };
  }

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ status: body.status, updatedAt: now, ...slaUpdate })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "status_changed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        newStatus: body.status,
      }),
      createdAt: now,
    }),
  ]);

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
