import { describe, expect, it, vi } from "vitest";
import type { AuthedContext } from "./handler";
import {
  assertAgentMayReassign,
  assertTicketVisible,
  hasAgentReassignmentTeam,
} from "./scope";
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

  it("intersects live visibility with a selected OAuth product grant", () => {
    expect(() =>
      assertTicketVisible(
        context(Role.ProductAdmin, {
          productIds: ["product-1", "product-2"],
          delegatedResourceScope: {
            mode: "selected",
            tenantIds: [],
            productIds: ["product-2"],
          },
        }),
        ticket
      )
    ).toThrow();
  });

  it("allows a selected tenant but never expands the user's live product scope", () => {
    expect(() =>
      assertTicketVisible(
        context(Role.ProductAdmin, {
          productIds: ["product-1"],
          delegatedResourceScope: {
            mode: "selected",
            tenantIds: ["tenant-1"],
            productIds: [],
          },
        }),
        ticket
      )
    ).not.toThrow();

    expect(() =>
      assertTicketVisible(
        context(Role.ProductAdmin, {
          productIds: ["product-2"],
          delegatedResourceScope: {
            mode: "selected",
            tenantIds: ["tenant-1"],
            productIds: [],
          },
        }),
        ticket
      )
    ).toThrow();
  });
});

function reassignmentContext(
  membership: { teamId: string } | undefined,
  role = Role.Agent,
): { context: AuthedContext; getMembership: ReturnType<typeof vi.fn> } {
  const getMembership = vi.fn().mockResolvedValue(membership);
  const context = {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({ get: getMembership })),
          })),
        })),
      })),
    },
    user: { id: "agent-1", tenantId: "tenant-1" },
    role,
    isSuperAdmin: false,
    tenantIds: ["tenant-1"],
    teamIds: [],
    productIds: [],
    params: {},
  } as unknown as AuthedContext;
  return { context, getMembership };
}

describe("agent reassignment scope", () => {
  it("uses current membership instead of the request-start team snapshot", async () => {
    const { context } = reassignmentContext({ teamId: "team-1" });

    await expect(assertAgentMayReassign(context, "team-1")).resolves.toBeUndefined();
    await expect(hasAgentReassignmentTeam(context)).resolves.toBe(true);
  });

  it("rejects reassignment after the current membership is removed", async () => {
    const { context } = reassignmentContext(undefined);
    context.teamIds = ["team-1"];

    await expect(assertAgentMayReassign(context, "team-1")).rejects.toMatchObject({
      status: 403,
    });
    await expect(hasAgentReassignmentTeam(context)).resolves.toBe(false);
  });

  it("never queries reassignment membership for another role", async () => {
    const { context, getMembership } = reassignmentContext(
      { teamId: "team-1" },
      Role.TeamAdmin,
    );

    await expect(hasAgentReassignmentTeam(context)).resolves.toBe(false);
    await expect(assertAgentMayReassign(context, "team-1")).rejects.toMatchObject({
      status: 403,
    });
    expect(getMembership).not.toHaveBeenCalled();
  });
});
