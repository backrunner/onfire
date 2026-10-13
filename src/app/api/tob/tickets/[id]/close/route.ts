import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { serializeTicket } from "@/lib/tickets/serialize";
import { closeTicket } from "@/services/ticket-close";
import { closeTicketSchema } from "@/lib/tickets/close-schema";

export const POST = withAuth({ permission: "ticket.close" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("Ticket is already closed");
  }

  const body = await parseBody(req, closeTicketSchema);
  await closeTicket(ctx.db, ticket, ctx.user.id, body);

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });
  return ok({ ticket: updated ? serializeTicket(updated) : null });
});
