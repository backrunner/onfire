import { eq } from "drizzle-orm";
import { filteredInputs } from "@/drizzle/schema";
import type { Database } from "@/lib/db";

/** Server-created audit; never accepted from a public customer request. */
export interface IntakeRelease { id: string; actorId: string; reason: string }

export function releaseUpdate(db: Database, release: IntakeRelease, ticketId: string, replyId: string | null, now: string) {
  return db.update(filteredInputs).set({
    restoredTicketId: ticketId, restoredReplyId: replyId,
    releasedAt: now, releasedBy: release.actorId, releaseReason: release.reason,
  }).where(eq(filteredInputs.id, release.id));
}
