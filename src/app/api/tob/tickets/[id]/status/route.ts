import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, products } from "@/drizzle/schema";
import { guardedTicketChange } from "@/lib/tickets/guarded-change";
import { TicketStatus } from "@/lib/types";
import { conflict, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertApiKeyPermission } from "@/lib/api-keys/auth";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import {
  assertManualStatusTarget,
  assertTransition,
} from "@/lib/tickets/state-machine";
import { assertPublicAgentReply } from "@/lib/tickets/agent-reply";
import { statusTransitionSlaUpdate } from "@/lib/tickets/sla";

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
  if (ticket.status === TicketStatus.Closed) assertApiKeyPermission(ctx, "reopen_ticket");
  assertManualStatusTarget(body.status);
  assertTransition(ticket.status, body.status);
  if (body.status === TicketStatus.Replied) {
    await assertPublicAgentReply(ctx.db, ticket.id);
  }

  const now = new Date().toISOString();
  let product: typeof products.$inferSelect | undefined;
  if (
    ticket.assigneeId &&
    body.status === TicketStatus.Processing &&
    (ticket.status === TicketStatus.New ||
      ticket.status === TicketStatus.Closed)
  ) {
    product = await ctx.db.query.products.findFirst({
      where: eq(products.id, ticket.productId),
    });
  }
  const slaUpdate = statusTransitionSlaUpdate(
    ticket,
    body.status,
    product,
    new Date(now),
  );

  const changed = await guardedTicketChange(
    ctx.db,
    ticket,
    {
      status: body.status, updatedAt: now, ...slaUpdate
    },
    {
      actorId: ctx.user.id,
      action: "status_changed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        newStatus: body.status,
      }),
      createdAt: now,
    },
  );
  if (!changed) throw conflict("Ticket changed; reload before retrying");

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
