import { describe, it, expect } from "vitest";
import { computeSlaDeadlines, slaViewOf } from "@/lib/tickets/sla";
import { TicketPriority } from "@/lib/types";
import type { products } from "@/drizzle/schema";

type ProductRow = typeof products.$inferSelect;

const product = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: "p1",
  tenantId: "t1",
  name: "Product",
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
