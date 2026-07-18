import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tickets } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { badRequest, notFound, ok } from "@/lib/api/response";
import { InternalStateValidationError, setTicketInternalStateValue } from "@/services/ticket-internal-states";

const schema = z.object({ stateId: z.string().min(1), value: z.union([z.boolean(), z.string(), z.null()]) });

export const PATCH = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({ where: eq(tickets.id, ctx.params.id) });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);
  const body = await parseBody(req, schema);
  try {
    const value = await setTicketInternalStateValue(ctx.db, ticket.id, body.stateId, body.value, ctx.user.id);
    return ok({ stateId: body.stateId, value });
  } catch (error) {
    if (error instanceof InternalStateValidationError) throw badRequest(error.message);
    throw error;
  }
});
