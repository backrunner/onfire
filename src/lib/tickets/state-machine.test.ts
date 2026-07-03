import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isOpen,
  OPEN_STATUSES,
} from "@/lib/tickets/state-machine";
import { TicketStatus } from "@/lib/types";
import { ApiError } from "@/lib/api/response";

describe("ticket state machine", () => {
  it("allows the documented lifecycle transitions", () => {
    expect(canTransition(TicketStatus.New, TicketStatus.Processing)).toBe(true);
    expect(canTransition(TicketStatus.Processing, TicketStatus.Replied)).toBe(true);
    expect(canTransition(TicketStatus.Replied, TicketStatus.Processing)).toBe(true);
    expect(canTransition(TicketStatus.Escalated, TicketStatus.Replied)).toBe(true);
  });

  it("allows closing from any open status", () => {
    for (const status of OPEN_STATUSES) {
      expect(canTransition(status, TicketStatus.Closed)).toBe(true);
    }
  });

  it("allows escalating from any open status except escalated itself", () => {
    expect(canTransition(TicketStatus.New, TicketStatus.Escalated)).toBe(true);
    expect(canTransition(TicketStatus.Processing, TicketStatus.Escalated)).toBe(true);
    expect(canTransition(TicketStatus.Replied, TicketStatus.Escalated)).toBe(true);
    expect(canTransition(TicketStatus.Escalated, TicketStatus.Escalated)).toBe(false);
  });

  it("closed is terminal", () => {
    expect(canTransition(TicketStatus.Closed, TicketStatus.New)).toBe(false);
    expect(canTransition(TicketStatus.Closed, TicketStatus.Processing)).toBe(false);
    expect(canTransition(TicketStatus.Closed, TicketStatus.Replied)).toBe(false);
    expect(canTransition(TicketStatus.Closed, TicketStatus.Escalated)).toBe(false);
    expect(isOpen(TicketStatus.Closed)).toBe(false);
  });

  it("forbids skipping new → replied", () => {
    expect(canTransition(TicketStatus.New, TicketStatus.Replied)).toBe(false);
  });

  it("assertTransition throws ApiError(400) on invalid transitions", () => {
    expect(() =>
      assertTransition(TicketStatus.Closed, TicketStatus.Processing)
    ).toThrowError(ApiError);
    expect(() =>
      assertTransition(TicketStatus.New, TicketStatus.New)
    ).toThrowError(/already/);
  });
});
