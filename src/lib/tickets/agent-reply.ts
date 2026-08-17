import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { replies } from "@/drizzle/schema";
import { badRequest } from "@/lib/api/response";
import type { Database } from "@/lib/db";

/**
 * A ticket may only move to "replied" after a public agent reply exists;
 * otherwise the customer-facing status would claim a reply that never happened.
 */
export async function assertPublicAgentReply(
  db: Database,
  ticketId: string
): Promise<void> {
  const reply = await db.query.replies.findFirst({
    where: and(
      eq(replies.ticketId, ticketId),
      isNotNull(replies.senderId),
      eq(replies.internal, false)
    ),
    columns: { id: true },
  });
  if (!reply) {
    throw badRequest(
      "Cannot mark as replied before a public agent reply exists"
    );
  }
}

/** Ticket IDs (from the given set) that have at least one public agent reply. */
export async function ticketIdsWithAgentReply(
  db: Database,
  ticketIds: string[]
): Promise<Set<string>> {
  if (ticketIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ ticketId: replies.ticketId })
    .from(replies)
    .where(
      and(
        inArray(replies.ticketId, ticketIds),
        isNotNull(replies.senderId),
        eq(replies.internal, false)
      )
    );
  return new Set(rows.map((row) => row.ticketId));
}
