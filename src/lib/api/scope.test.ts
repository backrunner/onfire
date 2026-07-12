import { describe, expect, it } from "vitest";
import type { AuthedContext } from "./handler";
import { assertTicketVisible } from "./scope";
import type { TicketRow } from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";

const ticket = {
  id: "ticket-1",
  tenantId: "tenant-1",
  productId: "product-1",
  teamId: "team-1",
  status: TicketStatus.New,
  priority: TicketPriority.Medium,
  subject: "Subject",
  content: "Content",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as TicketRow;

function context(role: Role, values: Partial<AuthedContext>): AuthedContext {
  return {
    role,
    isSuperAdmin: false,
    tenantIds: ["tenant-1"],
    teamIds: [],
    productIds: [],
    ...values,
  } as AuthedContext;
}

describe("ticket visibility scope", () => {
  it("uses team scope for TeamAdmin even when the default team is not product-linked", () => {
    expect(() =>
      assertTicketVisible(
        context(Role.TeamAdmin, { teamIds: ["team-1"], productIds: [] }),
        ticket
      )
    ).not.toThrow();
  });

  it("rejects another team for team-scoped roles", () => {
    expect(() =>
      assertTicketVisible(context(Role.Agent, { teamIds: ["team-2"] }), ticket)
    ).toThrow();
  });

  it("uses explicit product scope for ProductAdmin", () => {
    expect(() =>
      assertTicketVisible(
        context(Role.ProductAdmin, { productIds: ["product-1"] }),
        ticket
      )
    ).not.toThrow();
    expect(() =>
      assertTicketVisible(
        context(Role.ProductAdmin, { productIds: ["product-2"] }),
        ticket
      )
    ).toThrow();
  });
});
