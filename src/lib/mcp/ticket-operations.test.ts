import { describe, expect, it, vi } from "vitest";
import type { TicketRow } from "@/drizzle/schema";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import type { McpGrantContext } from "./grants";
import {
  assignMcpTicket,
  closeMcpTicket,
  escalateMcpTicket,
  getMcpTicket,
  listMcpTicketAgents,
  listMcpTickets,
  replyToMcpTicket,
  updateMcpTicketPriority,
  updateMcpTicketStatus,
} from "./ticket-operations";

const permissionCases = [
  {
    name: "ticket list",
    permission: "tickets:read",
    run: (ctx: McpGrantContext) =>
      listMcpTickets(ctx, { page: 1, pageSize: 20 }),
  },
  {
    name: "ticket detail",
    permission: "tickets:read",
    run: (ctx: McpGrantContext) => getMcpTicket(ctx, "ticket-1"),
  },
  {
    name: "agent list",
    permission: "tickets:assign",
    run: (ctx: McpGrantContext) => listMcpTicketAgents(ctx, "ticket-1"),
  },
  {
    name: "reply",
    permission: "tickets:reply",
    run: (ctx: McpGrantContext) =>
      replyToMcpTicket(ctx, {
        ticketId: "ticket-1",
        content: "Reply",
        internal: false,
      }),
  },
  {
    name: "status update",
    permission: "tickets:update_status",
    run: (ctx: McpGrantContext) =>
      updateMcpTicketStatus(ctx, {
        ticketId: "ticket-1",
        status: TicketStatus.Processing,
      }),
  },
  {
    name: "priority update",
    permission: "tickets:update_priority",
    run: (ctx: McpGrantContext) =>
      updateMcpTicketPriority(ctx, {
        ticketId: "ticket-1",
        priority: TicketPriority.High,
      }),
  },
  {
    name: "assignment",
    permission: "tickets:assign",
    run: (ctx: McpGrantContext) =>
      assignMcpTicket(ctx, {
        ticketId: "ticket-1",
        assigneeId: "agent-1",
        mode: "assign",
      }),
  },
  {
    name: "reassignment",
    permission: "tickets:reassign",
    run: (ctx: McpGrantContext) =>
      assignMcpTicket(ctx, {
        ticketId: "ticket-1",
        assigneeId: "agent-1",
        mode: "reassign",
      }),
  },
  {
    name: "escalation",
    permission: "tickets:escalate",
    run: (ctx: McpGrantContext) =>
      escalateMcpTicket(ctx, { ticketId: "ticket-1" }),
  },
  {
    name: "closure",
    permission: "tickets:close",
    run: (ctx: McpGrantContext) =>
      closeMcpTicket(ctx, { ticketId: "ticket-1" }),
  },
] as const;

describe("MCP ticket writes", () => {
  it.each(permissionCases)(
    "checks $permission inside the $name operation before database access",
    async ({ permission, run }) => {
      const databaseAccess = vi.fn();
      const context = {
        db: new Proxy(
          {},
          {
            get: (_target, property) => {
              databaseAccess(property);
              return undefined;
            },
          },
        ),
        mcpPermissions: [],
      } as unknown as McpGrantContext;

      await expect(run(context)).rejects.toMatchObject({
        status: 403,
        message: `MCP permission required: ${permission}`,
      });
      expect(databaseAccess).not.toHaveBeenCalled();
    },
  );

  it("does not return the full ticket through a write-only capability", async () => {
    const findTicket = vi.fn().mockResolvedValue({
      id: "ticket-1",
      tenantId: "tenant-1",
      productId: "product-1",
      teamId: "team-1",
      status: TicketStatus.Processing,
      priority: TicketPriority.Medium,
      subject: "Sensitive subject",
      content: "Sensitive customer content",
      customerEmail: "customer@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as TicketRow);
    const context = {
      db: {
        query: { tickets: { findFirst: findTicket } },
        update: vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn(() => ({})) })),
        })),
        insert: vi.fn(() => ({ values: vi.fn(() => ({})) })),
        batch: vi.fn().mockResolvedValue([]),
      },
      user: { id: "user-1" },
      role: Role.SuperAdmin,
      isSuperAdmin: true,
      tenantIds: [],
      teamIds: [],
      productIds: [],
      mcpPermissions: ["tickets:update_status"],
    } as unknown as McpGrantContext;

    const result = await updateMcpTicketStatus(context, {
      ticketId: "ticket-1",
      status: TicketStatus.Replied,
    });

    expect(result).toEqual({
      ticketId: "ticket-1",
      status: TicketStatus.Replied,
      updatedAt: expect.any(String),
    });
    expect(result).not.toHaveProperty("subject");
    expect(result).not.toHaveProperty("customerEmail");
    expect(findTicket).toHaveBeenCalledTimes(1);
  });

  it("does not load a product or start reply SLA for an unassigned status change", async () => {
    const findProduct = vi.fn();
    const setTicket = vi.fn<(values: Record<string, unknown>) => {
      where: () => unknown;
    }>(() => ({ where: () => ({}) }));
    const context = {
      db: {
        query: {
          tickets: {
            findFirst: vi.fn().mockResolvedValue({
              id: "ticket-1",
              tenantId: "tenant-1",
              productId: "product-1",
              teamId: "team-1",
              assigneeId: null,
              status: TicketStatus.New,
              priority: TicketPriority.High,
            } as TicketRow),
          },
          products: { findFirst: findProduct },
        },
        update: vi.fn(() => ({ set: setTicket })),
        insert: vi.fn(() => ({ values: vi.fn(() => ({})) })),
        batch: vi.fn().mockResolvedValue([]),
      },
      user: { id: "user-1" },
      role: Role.SuperAdmin,
      isSuperAdmin: true,
      tenantIds: [],
      teamIds: [],
      productIds: [],
      mcpPermissions: ["tickets:update_status"],
    } as unknown as McpGrantContext;

    await updateMcpTicketStatus(context, {
      ticketId: "ticket-1",
      status: TicketStatus.Processing,
    });

    expect(findProduct).not.toHaveBeenCalled();
    expect(setTicket).toHaveBeenCalledWith(
      expect.objectContaining({ status: TicketStatus.Processing }),
    );
    expect(setTicket.mock.calls[0]?.[0]).not.toHaveProperty("slaReplyDeadline");
  });
});
