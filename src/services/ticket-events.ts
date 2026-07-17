import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Database } from "@/lib/db";
import type { NotificationTriggerEvent } from "@/drizzle/schema";
import { sendRecipientNotifications } from "@/services/notification/service";
import { sendTicketNotification } from "@/services/email/outbound";
import { prescreenTicket } from "@/services/ai/prescreening";

/**
 * Domain events for the ticket lifecycle. Emitting an event fans out to:
 *  - agent notification channels (per-product config, filtered by trigger)
 *  - customer-facing transactional email (per-product outbound config)
 *
 * Side effects run via `waitUntil` so API latency is unaffected; failures are
 * logged by the underlying services (notification_logs / outbound_emails).
 */
export type TicketEventType =
  | NotificationTriggerEvent // ticket_created | ticket_assigned | ticket_reassigned | ticket_escalated | ticket_expiring | customer_replied | ticket_closed
  | "agent_replied";

export interface TicketEvent {
  type: TicketEventType;
  ticketId: string;
  /** Agent the event concerns (assignment target, replier…) */
  agentId?: string;
  previousAgentName?: string;
  /** Reply that triggered the event (drives the email body) */
  replyId?: string;
  customerEmail?: string;
  /** Email ingestion can complete the same prescreening before ticket creation. */
  aiPrescreened?: boolean;
}

const NOTIFICATION_EVENTS = new Set<NotificationTriggerEvent>([
  "ticket_created",
  "ticket_assigned",
  "ticket_reassigned",
  "ticket_escalated",
  "ticket_expiring",
  "customer_replied",
  "ticket_closed",
]);

type EmailTemplateType =
  | "ticket_created"
  | "ticket_replied"
  | "ticket_closed"
  | "ticket_escalated";

const EMAIL_BY_EVENT: Partial<Record<TicketEventType, EmailTemplateType>> = {
  ticket_created: "ticket_created",
  agent_replied: "ticket_replied",
  ticket_closed: "ticket_closed",
  ticket_escalated: "ticket_escalated",
};

async function dispatch(db: Database, event: TicketEvent): Promise<void> {
  const jobs: Promise<unknown>[] = [];

  if (NOTIFICATION_EVENTS.has(event.type as NotificationTriggerEvent)) {
    jobs.push(
      sendRecipientNotifications(db, {
        ticketId: event.ticketId,
        agentId: event.agentId,
        triggerEvent: event.type as NotificationTriggerEvent,
        previousAgentName: event.previousAgentName,
        customerEmail: event.customerEmail,
      }).catch((error) =>
        console.error(`Notification dispatch failed (${event.type}):`, error)
      )
    );
  }

  const emailTemplate = EMAIL_BY_EVENT[event.type];
  if (emailTemplate) {
    jobs.push(
      sendTicketNotification(db, {
        ticketId: event.ticketId,
        templateType: emailTemplate,
        replyId: event.replyId,
      }).catch((error) =>
        console.error(`Outbound email dispatch failed (${event.type}):`, error)
      )
    );
  }

  // AI prescreening on new tickets — no-op when the prescreening task
  // is not configured; failures only mark aiScreeningStatus=error.
  if (event.type === "ticket_created" && !event.aiPrescreened) {
    jobs.push(
      prescreenTicket(db, event.ticketId).catch((error) =>
        console.error("AI prescreening failed:", error)
      )
    );
  }

  await Promise.all(jobs);
}

/**
 * Emit a ticket event without blocking the response. Uses the Workers
 * `waitUntil` when available; falls back to a detached promise in dev.
 */
export function emitTicketEvent(db: Database, event: TicketEvent): void {
  const work = dispatch(db, event);
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(work);
  } catch {
    void work.catch((error) =>
      console.error("Ticket event dispatch failed:", error)
    );
  }
}

/** Await variant for contexts that must not outlive the work (cron). */
export async function emitTicketEventSync(
  db: Database,
  event: TicketEvent
): Promise<void> {
  await dispatch(db, event);
}
