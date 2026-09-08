import { and, eq, lt, lte, gt, isNotNull, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { tickets, history, products } from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { emitTicketEventSync } from "@/services/ticket-events";
import { purgeExpiredLoginLimits } from "@/lib/auth/login-protection";

export interface ScanReport {
  acceptWarnings: number;
  replyWarnings: number;
  acceptBreaches: number;
  replyBreaches: number;
  autoClosed: number;
}

/** How long before an SLA deadline the "expiring" warning fires. */
const WARNING_WINDOW_MS = 30 * 60 * 1000;

const ACCEPT_PENDING_STATUSES = [TicketStatus.New] as const;
const REPLY_PENDING_STATUSES = [
  TicketStatus.Processing,
  TicketStatus.Escalated,
] as const;

/**
 * Periodic maintenance, invoked from the worker cron trigger:
 *  1. fire a ticket_expiring warning once when an SLA deadline is within
 *     the warning window (deduped via the sla*Warned flags)
 *  2. mark SLA breaches; tickets that never got a pre-warning are
 *     notified at breach time instead
 *  3. auto-close tickets in "replied" status after the product's configured
 *     customer-inactivity window
 */
export async function runScheduledScan(db: Database): Promise<ScanReport> {
  const now = new Date().toISOString();
  const warnHorizon = new Date(Date.now() + WARNING_WINDOW_MS).toISOString();
  const report: ScanReport = {
    acceptWarnings: 0,
    replyWarnings: 0,
    acceptBreaches: 0,
    replyBreaches: 0,
    autoClosed: 0,
  };

  // --- Pre-breach warnings ---------------------------------------------
  const acceptExpiring = await db
    .select()
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, [...ACCEPT_PENDING_STATUSES]),
        eq(tickets.slaAcceptWarned, false),
        eq(tickets.slaAcceptBreached, false),
        isNotNull(tickets.slaAcceptDeadline),
        gt(tickets.slaAcceptDeadline, now),
        lte(tickets.slaAcceptDeadline, warnHorizon)
      )
    )
    .limit(200);

  for (const ticket of acceptExpiring) {
    const claimed = await db
      .update(tickets)
      .set({ slaAcceptWarned: true })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.status, TicketStatus.New),
          eq(tickets.slaAcceptWarned, false),
          eq(tickets.slaAcceptBreached, false)
        )
      )
      .returning({ id: tickets.id });
    if (claimed.length === 0) continue;
    await emitTicketEventSync(db, {
      type: "ticket_expiring",
      ticketId: ticket.id,
      agentId: ticket.assigneeId ?? undefined,
    });
    report.acceptWarnings++;
  }

  const replyExpiring = await db
    .select()
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, [...REPLY_PENDING_STATUSES]),
        eq(tickets.slaReplyWarned, false),
        eq(tickets.slaReplyBreached, false),
        isNotNull(tickets.slaReplyDeadline),
        gt(tickets.slaReplyDeadline, now),
        lte(tickets.slaReplyDeadline, warnHorizon)
      )
    )
    .limit(200);

  for (const ticket of replyExpiring) {
    const claimed = await db
      .update(tickets)
      .set({ slaReplyWarned: true })
      .where(
        and(
          eq(tickets.id, ticket.id),
          inArray(tickets.status, [...REPLY_PENDING_STATUSES]),
          eq(tickets.slaReplyWarned, false),
          eq(tickets.slaReplyBreached, false)
        )
      )
      .returning({ id: tickets.id });
    if (claimed.length === 0) continue;
    await emitTicketEventSync(db, {
      type: "ticket_expiring",
      ticketId: ticket.id,
      agentId: ticket.assigneeId ?? undefined,
    });
    report.replyWarnings++;
  }

  // --- Breach marking ----------------------------------------------------
  const acceptBreached = await db
    .select()
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, [...ACCEPT_PENDING_STATUSES]),
        eq(tickets.slaAcceptBreached, false),
        isNotNull(tickets.slaAcceptDeadline),
        lt(tickets.slaAcceptDeadline, now)
      )
    )
    .limit(200);

  for (const ticket of acceptBreached) {
    const claimed = await db
      .update(tickets)
      .set({ slaAcceptBreached: true, slaAcceptWarned: true, updatedAt: now })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.status, TicketStatus.New),
          eq(tickets.slaAcceptBreached, false)
        )
      )
      .returning({ id: tickets.id });
    if (claimed.length === 0) continue;
    // Short-SLA tickets can breach between scans without ever being
    // warned — make sure they get exactly one notification.
    if (!ticket.slaAcceptWarned) {
      await emitTicketEventSync(db, {
        type: "ticket_expiring",
        ticketId: ticket.id,
        agentId: ticket.assigneeId ?? undefined,
      });
    }
    report.acceptBreaches++;
  }

  const replyBreached = await db
    .select()
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, [...REPLY_PENDING_STATUSES]),
        eq(tickets.slaReplyBreached, false),
        isNotNull(tickets.slaReplyDeadline),
        lt(tickets.slaReplyDeadline, now)
      )
    )
    .limit(200);

  for (const ticket of replyBreached) {
    const claimed = await db
      .update(tickets)
      .set({ slaReplyBreached: true, slaReplyWarned: true, updatedAt: now })
      .where(
        and(
          eq(tickets.id, ticket.id),
          inArray(tickets.status, [...REPLY_PENDING_STATUSES]),
          eq(tickets.slaReplyBreached, false)
        )
      )
      .returning({ id: tickets.id });
    if (claimed.length === 0) continue;
    if (!ticket.slaReplyWarned) {
      await emitTicketEventSync(db, {
        type: "ticket_expiring",
        ticketId: ticket.id,
        agentId: ticket.assigneeId ?? undefined,
      });
    }
    report.replyBreaches++;
  }

  // --- Auto-close: "replied" tickets with no customer activity -------------
  const autoCloseProducts = await db
    .select({ id: products.id, autoCloseMinutes: products.autoCloseMinutes })
    .from(products)
    .where(isNotNull(products.autoCloseMinutes));

  for (const product of autoCloseProducts) {
    if (!product.autoCloseMinutes || product.autoCloseMinutes <= 0) continue;
    const cutoff = new Date(
      Date.now() - product.autoCloseMinutes * 60_000
    ).toISOString();

    const stale = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.productId, product.id),
          eq(tickets.status, TicketStatus.Replied),
          lt(tickets.updatedAt, cutoff)
        )
      )
      .limit(200);

    for (const ticket of stale) {
      const claimed = await db
        .update(tickets)
        .set({ status: TicketStatus.Closed, updatedAt: now })
        .where(
          and(
            eq(tickets.id, ticket.id),
            eq(tickets.status, TicketStatus.Replied),
            lt(tickets.updatedAt, cutoff)
          )
        )
        .returning({ id: tickets.id });
      if (claimed.length === 0) continue;
      await db.insert(history).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          action: "auto_closed",
          snapshot: JSON.stringify({
            reason: `No customer activity for ${product.autoCloseMinutes} minutes`,
          }),
          createdAt: now,
        });
      await emitTicketEventSync(db, {
        type: "ticket_closed",
        ticketId: ticket.id,
        agentId: ticket.assigneeId ?? undefined,
      });
      report.autoClosed++;
    }
  }

  try {
    const { purgeExpiredAiUsage } = await import("@/services/ai/usage");
    await purgeExpiredAiUsage(db);
  } catch (error) {
    console.error("AI usage retention purge failed:", error);
  }

  try {
    await purgeExpiredLoginLimits(db);
  } catch (error) {
    console.error("Login rate limit cleanup failed:", error);
  }

  return report;
}
