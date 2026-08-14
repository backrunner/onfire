import { describe, it, expect } from "vitest";
import {
  computeInitialSlaDeadlines,
  computeSlaDeadlines,
  isTicketSlaOverdue,
  restartReplySla,
  slaViewOf,
  statusTransitionSlaUpdate,
} from "@/lib/tickets/sla";
import { TicketPriority, TicketStatus } from "@/lib/types";
import type { products } from "@/drizzle/schema";

type ProductRow = typeof products.$inferSelect;

const product = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: "p1",
  tenantId: "t1",
  name: "Product",
  homepageUrl: null,
  portalReturnUrl: null,
  slaHighAccept: 30,
  slaHighReply: 60,
  slaMediumAccept: 120,
  slaMediumReply: 240,
  slaLowAccept: null,
  slaLowReply: null,
  autoCloseMinutes: null,
  ...overrides,
});

describe("computeSlaDeadlines", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");

  it("uses the per-priority policy", () => {
    const high = computeSlaDeadlines(product(), TicketPriority.High, from);
    expect(high.slaAcceptDeadline).toBe("2026-01-01T00:30:00.000Z");
    expect(high.slaReplyDeadline).toBe("2026-01-01T01:00:00.000Z");

    const medium = computeSlaDeadlines(product(), TicketPriority.Medium, from);
    expect(medium.slaAcceptDeadline).toBe("2026-01-01T02:00:00.000Z");
  });

  it("returns null deadlines when no policy is configured", () => {
    const low = computeSlaDeadlines(product(), TicketPriority.Low, from);
    expect(low.slaAcceptDeadline).toBeNull();
    expect(low.slaReplyDeadline).toBeNull();
  });

  it("does not start a reply SLA before an unassigned ticket is accepted", () => {
    const pending = computeInitialSlaDeadlines(
      product(),
      TicketPriority.Medium,
      false,
      from
    );
    const accepted = computeInitialSlaDeadlines(
      product(),
      TicketPriority.Medium,
      true,
      from
    );

    expect(pending.slaAcceptDeadline).toBe("2026-01-01T02:00:00.000Z");
    expect(pending.slaReplyDeadline).toBeNull();
    expect(accepted.slaReplyDeadline).toBe("2026-01-01T04:00:00.000Z");
  });

  it("restarts reply timing with clean warning and breach flags", () => {
    expect(restartReplySla(product(), TicketPriority.High, from)).toEqual({
      slaReplyDeadline: "2026-01-01T01:00:00.000Z",
      slaReplyBreached: false,
      slaReplyWarned: false,
    });
  });

  it("starts a status-transition reply SLA only for assigned tickets", () => {
    const base = {
      status: TicketStatus.New,
      priority: TicketPriority.High,
    };

    expect(
      statusTransitionSlaUpdate(
        { ...base, assigneeId: null },
        TicketStatus.Processing,
        product(),
        from,
      ),
    ).toEqual({});
    expect(
      statusTransitionSlaUpdate(
        { ...base, assigneeId: "agent-1" },
        TicketStatus.Processing,
        product(),
        from,
      ),
    ).toEqual({
      slaReplyDeadline: "2026-01-01T01:00:00.000Z",
      slaReplyBreached: false,
      slaReplyWarned: false,
    });
  });

  it("clears the active reply deadline when status becomes replied", () => {
    expect(
      statusTransitionSlaUpdate(
        {
          status: TicketStatus.Processing,
          priority: TicketPriority.High,
          assigneeId: "agent-1",
        },
        TicketStatus.Replied,
        product(),
        from,
      ),
    ).toEqual({ slaReplyDeadline: null });
  });
});

describe("slaViewOf", () => {
  it("returns undefined when the ticket carries no SLA", () => {
    expect(
      slaViewOf({
        slaAcceptDeadline: null,
        slaReplyDeadline: null,
        slaAcceptBreached: false,
        slaReplyBreached: false,
      })
    ).toBeUndefined();
  });

  it("reports live breaches even before the cron persisted the flag", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const view = slaViewOf({
      slaAcceptDeadline: past,
      slaReplyDeadline: null,
      slaAcceptBreached: false,
      slaReplyBreached: false,
    });
    expect(view?.acceptBreached).toBe(true);
    expect(view?.replyBreached).toBe(false);
  });

  it("honors persisted breach flags even if deadlines were reset", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const view = slaViewOf({
      slaAcceptDeadline: future,
      slaReplyDeadline: future,
      slaAcceptBreached: true,
      slaReplyBreached: false,
    });
    expect(view?.acceptBreached).toBe(true);
  });
});

describe("isTicketSlaOverdue", () => {
  it("only treats the SLA applicable to the current status as overdue", () => {
    const now = Date.now();
    const old = new Date(now - 60_000).toISOString();
    const fresh = new Date(now + 60_000).toISOString();
    const base = {
      slaAcceptDeadline: old,
      slaReplyDeadline: old,
      slaAcceptBreached: false,
      slaReplyBreached: false,
    };

    expect(isTicketSlaOverdue({ ...base, status: TicketStatus.New }, now)).toBe(true);
    expect(
      isTicketSlaOverdue(
        { ...base, status: TicketStatus.Processing, slaReplyDeadline: fresh },
        now
      )
    ).toBe(false);
    expect(isTicketSlaOverdue({ ...base, status: TicketStatus.Replied }, now)).toBe(false);
  });
});
