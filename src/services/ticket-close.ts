import type { z } from "zod";
import type { TicketRow } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { TicketStatus } from "@/lib/types";
import { badRequest, conflict } from "@/lib/api/response";
import type { closeTicketSchema } from "@/lib/tickets/close-schema";
import { guardedTicketChange } from "@/lib/tickets/guarded-change";
import { emitTicketEvent } from "@/services/ticket-events";

/** Call only after checking closure permission and the ticket's live scope. */
export async function closeTicket(
  db: Database,
  ticket: TicketRow,
  actorId: string,
  options: z.infer<typeof closeTicketSchema> & { bulk?: boolean },
): Promise<string> {
  if (ticket.status === TicketStatus.Closed) throw badRequest("Ticket is already closed");
  const now = new Date().toISOString();
  const changed = await guardedTicketChange(db, ticket,
    { status: TicketStatus.Closed, updatedAt: now },
    {
      actorId,
      action: "closed",
      snapshot: JSON.stringify({ previousStatus: ticket.status, ...options }),
      createdAt: now,
    },
  );
  if (!changed) throw conflict("Ticket changed; reload before retrying");
  emitTicketEvent(db, {
    type: "ticket_closed",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
    notifyCustomer: options.notifyCustomer,
  });
  return now;
}
