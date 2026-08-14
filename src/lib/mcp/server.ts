import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeHttpUrl } from "@/lib/external-url";
import { hasMcpPermission, type McpGrantContext } from "@/lib/mcp/grants";
import {
  getMcpProductSettings,
  listMcpProducts,
  updateMcpProductSettings,
} from "@/lib/mcp/settings-operations";
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
} from "@/lib/mcp/ticket-operations";
import { runMcpTool } from "@/lib/mcp/tool-result";
import { TicketPriority, TicketStatus } from "@/lib/types";

const readOnlyAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const optionalHttpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => safeHttpUrl(value) !== null, {
    message: "Only credential-free HTTP(S) URLs are allowed",
  })
  .nullable()
  .optional();

export function createMcpServer(ctx: McpGrantContext): McpServer {
  const server = new McpServer({ name: "OnFire", version: "0.2.0" });

  if (hasMcpPermission(ctx, "tickets:read")) {
    server.registerTool(
      "list_tickets",
      {
        title: "List tickets",
        description:
          "List OnFire tickets within the resources delegated by the user. Results are priority ordered and paginated.",
        inputSchema: {
          productId: z.string().min(1).optional(),
          teamId: z.string().min(1).optional(),
          assigneeId: z.string().min(1).optional(),
          status: z.enum(TicketStatus).optional(),
          priority: z.enum(TicketPriority).optional(),
          overdue: z.boolean().optional(),
          query: z.string().max(200).optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        },
        annotations: readOnlyAnnotations,
      },
      (input) => runMcpTool(() => listMcpTickets(ctx, input)),
    );

    server.registerTool(
      "get_ticket",
      {
        title: "Get ticket",
        description:
          "Get one delegated OnFire ticket with replies, history, form version, and internal state values.",
        inputSchema: { ticketId: z.string().min(1) },
        annotations: readOnlyAnnotations,
      },
      ({ ticketId }) => runMcpTool(() => getMcpTicket(ctx, ticketId)),
    );
  }

  if (
    hasMcpPermission(ctx, "tickets:assign") ||
    hasMcpPermission(ctx, "tickets:reassign")
  ) {
    server.registerTool(
      "list_ticket_agents",
      {
        title: "List eligible ticket agents",
        description:
          "List active agents eligible for assignment in a delegated ticket's current team.",
        inputSchema: { ticketId: z.string().min(1) },
        annotations: readOnlyAnnotations,
      },
      ({ ticketId }) =>
        runMcpTool(() => listMcpTicketAgents(ctx, ticketId)),
    );
  }

  if (hasMcpPermission(ctx, "tickets:reply")) {
    server.registerTool(
      "reply_to_ticket",
      {
        title: "Reply to ticket",
        description:
          "Add a public agent reply or an internal note to a delegated OnFire ticket.",
        inputSchema: {
          ticketId: z.string().min(1),
          content: z.string().min(1).max(20_000),
          internal: z.boolean().default(false),
        },
        annotations: writeAnnotations,
      },
      (input) => runMcpTool(() => replyToMcpTicket(ctx, input)),
    );
  }

  if (hasMcpPermission(ctx, "tickets:update_status")) {
    server.registerTool(
      "update_ticket_status",
      {
        title: "Update ticket status",
        description:
          "Move a delegated ticket to processing or replied according to the OnFire status machine. Closing and escalation use dedicated tools.",
        inputSchema: {
          ticketId: z.string().min(1),
          status: z.enum([TicketStatus.Processing, TicketStatus.Replied]),
        },
        annotations: writeAnnotations,
      },
      (input) => runMcpTool(() => updateMcpTicketStatus(ctx, input)),
    );
  }

  if (hasMcpPermission(ctx, "tickets:update_priority")) {
    server.registerTool(
      "update_ticket_priority",
      {
        title: "Update ticket priority",
        description:
          "Change a delegated open ticket's priority and recompute its SLA deadlines using the product policy.",
        inputSchema: {
          ticketId: z.string().min(1),
          priority: z.enum(TicketPriority),
        },
        annotations: writeAnnotations,
      },
      (input) => runMcpTool(() => updateMcpTicketPriority(ctx, input)),
    );
  }

  if (hasMcpPermission(ctx, "tickets:assign")) {
    server.registerTool(
      "assign_ticket",
      {
        title: "Assign ticket",
        description:
          "Assign an unassigned delegated ticket to an active agent in its current team.",
        inputSchema: {
          ticketId: z.string().min(1),
          assigneeId: z.string().min(1),
        },
        annotations: writeAnnotations,
      },
      (input) =>
        runMcpTool(() => assignMcpTicket(ctx, { ...input, mode: "assign" })),
    );
  }

  if (hasMcpPermission(ctx, "tickets:reassign")) {
    server.registerTool(
      "reassign_ticket",
      {
        title: "Reassign ticket",
        description:
          "Reassign an assigned delegated ticket to another active agent in its current team and reset active SLA timers.",
        inputSchema: {
          ticketId: z.string().min(1),
          assigneeId: z.string().min(1),
        },
        annotations: writeAnnotations,
      },
      (input) =>
        runMcpTool(() =>
          assignMcpTicket(ctx, { ...input, mode: "reassign" }),
        ),
    );
  }

  if (hasMcpPermission(ctx, "tickets:escalate")) {
    server.registerTool(
      "escalate_ticket",
      {
        title: "Escalate ticket",
        description:
          "Escalate a delegated open ticket to a higher-level agent in the current team using OnFire load balancing.",
        inputSchema: {
          ticketId: z.string().min(1),
          reason: z.string().max(2000).optional(),
        },
        annotations: writeAnnotations,
      },
      (input) => runMcpTool(() => escalateMcpTicket(ctx, input)),
    );
  }

  if (hasMcpPermission(ctx, "tickets:close")) {
    server.registerTool(
      "close_ticket",
      {
        title: "Close ticket",
        description: "Close a delegated OnFire ticket and record the reason.",
        inputSchema: {
          ticketId: z.string().min(1),
          reason: z.string().max(2000).optional(),
        },
        annotations: { ...writeAnnotations, destructiveHint: true },
      },
      (input) => runMcpTool(() => closeMcpTicket(ctx, input)),
    );
  }

  if (hasMcpPermission(ctx, "settings:read")) {
    server.registerTool(
      "list_products",
      {
        title: "List products",
        description:
          "List products within the resources delegated to this OnFire connection.",
        annotations: readOnlyAnnotations,
      },
      () => runMcpTool(() => listMcpProducts(ctx)),
    );
    server.registerTool(
      "get_product_settings",
      {
        title: "Get product settings",
        description:
          "Read non-secret settings for one delegated OnFire product.",
        inputSchema: { productId: z.string().min(1) },
        annotations: readOnlyAnnotations,
      },
      ({ productId }) =>
        runMcpTool(() => getMcpProductSettings(ctx, productId)),
    );
  }

  if (hasMcpPermission(ctx, "settings:write")) {
    server.registerTool(
      "update_product_settings",
      {
        title: "Update product settings",
        description:
          "Update non-secret product portal URLs, SLA minutes, auto-close timeout, or display name within the delegated scope.",
        inputSchema: {
          productId: z.string().min(1),
          name: z.string().trim().min(1).max(100).optional(),
          homepageUrl: optionalHttpUrl,
          portalReturnUrl: optionalHttpUrl,
          slaHighAccept: z.number().int().positive().nullable().optional(),
          slaHighReply: z.number().int().positive().nullable().optional(),
          slaMediumAccept: z.number().int().positive().nullable().optional(),
          slaMediumReply: z.number().int().positive().nullable().optional(),
          slaLowAccept: z.number().int().positive().nullable().optional(),
          slaLowReply: z.number().int().positive().nullable().optional(),
          autoCloseMinutes: z.number().int().positive().nullable().optional(),
        },
        annotations: writeAnnotations,
      },
      (input) => runMcpTool(() => updateMcpProductSettings(ctx, input)),
    );
  }

  return server;
}
