import { TicketStatus } from "@/lib/types";
import { badRequest } from "@/lib/api/response";

/**
 * Canonical ticket lifecycle:
 *
 *   new ── accept ──▶ processing ── agent reply ──▶ replied
 *                        ▲                            │
 *                        └──── customer reply ────────┘
 *
 *   any open status ── escalate ──▶ escalated (then handled like processing)
 *   any open status ── close ──▶ closed
 *   closed ── reopen ──▶ processing (reply SLA restarts when assigned)
 */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.New]: [
    TicketStatus.Processing,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Processing]: [
    TicketStatus.Replied,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Replied]: [
    TicketStatus.Processing,
    TicketStatus.Escalated,
    TicketStatus.Closed,
  ],
  [TicketStatus.Escalated]: [
    TicketStatus.Processing,
    TicketStatus.Replied,
    TicketStatus.Closed,
  ],
  [TicketStatus.Closed]: [TicketStatus.Processing],
};

export const OPEN_STATUSES = [
  TicketStatus.New,
  TicketStatus.Processing,
  TicketStatus.Replied,
  TicketStatus.Escalated,
] as const;

export function isOpen(status: TicketStatus): boolean {
  return status !== TicketStatus.Closed;
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) {
    throw badRequest(`Ticket is already in status "${to}"`);
  }
  if (!canTransition(from, to)) {
    throw badRequest(`Invalid status transition: ${from} → ${to}`);
  }
}

/** Closed and escalated have dedicated endpoints with stronger permissions. */
export function assertManualStatusTarget(status: TicketStatus): void {
  if (status === TicketStatus.Closed || status === TicketStatus.Escalated) {
    throw badRequest(`Use the dedicated ${status} action`);
  }
}
