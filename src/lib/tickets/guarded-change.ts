import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { history, tickets } from "@/drizzle/schema";
import type { Database } from "@/lib/db";

function ticketSnapshotCondition(ticket: typeof tickets.$inferSelect) {
  return and(
    eq(tickets.id, ticket.id),
    eq(tickets.tenantId, ticket.tenantId),
    eq(tickets.productId, ticket.productId),
    eq(tickets.teamId, ticket.teamId),
    eq(tickets.status, ticket.status),
    eq(tickets.priority, ticket.priority),
    eq(tickets.updatedAt, ticket.updatedAt),
    ticket.assigneeId === null
      ? isNull(tickets.assigneeId)
      : eq(tickets.assigneeId, ticket.assigneeId),
  );
}

/** Commit the transition and its history only if its authorization state is current. */
export async function guardedTicketChange(
  db: Database,
  ticket: typeof tickets.$inferSelect,
  update: Partial<typeof tickets.$inferInsert>,
  event: Omit<typeof history.$inferInsert, "id" | "ticketId">,
  effects?: (applied: SQL) => BatchItem<"sqlite">[],
): Promise<boolean> {
  const eventId = crypto.randomUUID();
  const applied = sql`EXISTS (SELECT 1 FROM history WHERE id = ${eventId})`;
  // D1 batch is transactional: an INSERT ... SELECT claims this exact snapshot,
  // then its unique event ID gates the mutation. A stale request writes nothing.
  const [claimed] = await db.batch([
    db.insert(history)
      .select(
        db.select({
          id: sql<string>`${eventId}`.as("id"),
          ticketId: tickets.id,
          actorId: sql<string | null>`${event.actorId ?? null}`.as("actor_id"),
          action: sql<string>`${event.action}`.as("action"),
          snapshot: sql<string | null>`${event.snapshot ?? null}`.as("snapshot"),
          createdAt: sql<string>`${event.createdAt}`.as("created_at"),
        }).from(tickets).where(ticketSnapshotCondition(ticket)),
      )
      .returning({ id: history.id }),
    db.update(tickets).set(update)
      .where(and(eq(tickets.id, ticket.id), applied)),
    ...(effects ? effects(applied) : []),
  ]);
  return claimed.length > 0;
}
