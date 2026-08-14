import { and, count, desc, eq, exists, or, sql } from "drizzle-orm";
import {
  agents,
  agentTeams,
  customers,
  history,
  products,
  replies,
  ticketInternalStateValues,
  tickets,
  ticketTemplateVersions,
  ticketTypeInternalStates,
  users,
} from "@/drizzle/schema";
import {
  hasMcpPermission,
  requireMcpPermission,
  type McpGrantContext,
} from "@/lib/mcp/grants";
import { badRequest, forbidden, notFound } from "@/lib/api/response";
import {
  assertAgentMayReassign,
  assertTicketVisible,
  ticketScopeCondition,
} from "@/lib/api/scope";
import { parseFormSchema } from "@/lib/form-schema";
import {
  resolveCustomerExternalIds,
  resolveUserNames,
} from "@/lib/tickets/names";
import { serializeHistory, serializeTicket } from "@/lib/tickets/serialize";
import { activeSlaOverdueCondition } from "@/lib/tickets/sla";
import {
  computeInitialSlaDeadlines,
  computeSlaDeadlines,
  restartReplySla,
  statusTransitionSlaUpdate,
} from "@/lib/tickets/sla";
import {
  assertManualStatusTarget,
  assertTransition,
  isOpen,
} from "@/lib/tickets/state-machine";
import { Role, TicketPriority, TicketStatus } from "@/lib/types";
import { chooseEscalationAssignee } from "@/services/allocation";
import { emitTicketEvent } from "@/services/ticket-events";
import { serializeState } from "@/services/ticket-internal-states";

export interface McpTicketListInput {
  productId?: string;
  teamId?: string;
  assigneeId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  overdue?: boolean;
  query?: string;
  page: number;
  pageSize: number;
}

const priorityWeight = sql`CASE ${tickets.priority}
  WHEN 'high' THEN 0
  WHEN 'medium' THEN 1
  ELSE 2 END`;

async function loadVisibleTicket(ctx: McpGrantContext, ticketId: string) {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);
  return ticket;
}

export async function listMcpTickets(
  ctx: McpGrantContext,
  input: McpTicketListInput,
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:read");
  const conditions = [ticketScopeCondition(ctx)];
  if (input.productId) conditions.push(eq(tickets.productId, input.productId));
  if (input.teamId) conditions.push(eq(tickets.teamId, input.teamId));
  if (input.assigneeId) {
    conditions.push(eq(tickets.assigneeId, input.assigneeId));
  }
  if (input.status) conditions.push(eq(tickets.status, input.status));
  if (input.priority) conditions.push(eq(tickets.priority, input.priority));
  if (input.overdue) conditions.push(activeSlaOverdueCondition());
  if (input.query) {
    conditions.push(
      or(
        sql`instr(lower(${tickets.subject}), lower(${input.query})) > 0`,
        sql`instr(lower(${tickets.customerEmail}), lower(${input.query})) > 0`,
        sql`instr(lower(${tickets.id}), lower(${input.query})) > 0`,
        exists(
          ctx.db
            .select({ value: sql<number>`1` })
            .from(customers)
            .where(
              and(
                eq(customers.id, tickets.customerId),
                sql`instr(lower(${customers.externalId}), lower(${input.query})) > 0`,
              ),
            ),
        ),
      ),
    );
  }

  const where = and(...conditions.filter(Boolean));
  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(tickets)
    .where(where);
  const rows = await ctx.db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(priorityWeight, desc(tickets.updatedAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const [names, customerRefs] = await Promise.all([
    resolveUserNames(
      ctx.db,
      rows.map((row) => row.assigneeId),
    ),
    resolveCustomerExternalIds(
      ctx.db,
      rows.filter((row) => !row.customerEmail).map((row) => row.customerId),
    ),
  ]);

  return {
    items: rows.map((row) => ({
      ...serializeTicket(row),
      assigneeName: row.assigneeId ? (names[row.assigneeId] ?? null) : null,
      customerLabel:
        row.customerEmail ??
        (row.customerId ? (customerRefs[row.customerId] ?? null) : null),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getMcpTicket(
  ctx: McpGrantContext,
  ticketId: string,
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:read");
  const ticket = await loadVisibleTicket(ctx, ticketId);
  const [
    replyRows,
    historyRows,
    templateVersion,
    internalStateRows,
    internalStateValues,
  ] = await Promise.all([
    ctx.db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, ticket.id))
      .orderBy(replies.createdAt),
    ctx.db
      .select()
      .from(history)
      .where(eq(history.ticketId, ticket.id))
      .orderBy(history.createdAt),
    ticket.templateVersionId
      ? ctx.db.query.ticketTemplateVersions.findFirst({
          where: eq(ticketTemplateVersions.id, ticket.templateVersionId),
        })
      : undefined,
    ctx.db
      .select()
      .from(ticketTypeInternalStates)
      .where(eq(ticketTypeInternalStates.ticketTypeId, ticket.ticketTypeId))
      .orderBy(ticketTypeInternalStates.sortOrder, ticketTypeInternalStates.name),
    ctx.db
      .select()
      .from(ticketInternalStateValues)
      .where(eq(ticketInternalStateValues.ticketId, ticket.id)),
  ]);

  const serializedHistory = serializeHistory(historyRows);
  const snapshotIds = serializedHistory.flatMap((entry) => {
    const snapshot = entry.snapshot as
      | { newAssignee?: string; previousAssignee?: string | null }
      | undefined;
    return [snapshot?.newAssignee, snapshot?.previousAssignee ?? undefined];
  });
  const actors = await resolveUserNames(ctx.db, [
    ticket.assigneeId,
    ...replyRows.map((reply) => reply.senderId),
    ...historyRows.map((entry) => entry.actorId),
    ...snapshotIds,
  ]);
  const customerRefs = ticket.customerEmail
    ? {}
    : await resolveCustomerExternalIds(ctx.db, [ticket.customerId]);
  const valuesByState = new Map(
    internalStateValues.map((value) => [value.stateId, value]),
  );
  const namedReplies = replyRows.map((reply) => ({
    ...reply,
    senderName: reply.senderId ? (actors[reply.senderId] ?? null) : null,
  }));
  const namedHistory = serializedHistory.map((entry) => ({
    ...entry,
    actorName: entry.actorId ? (actors[entry.actorId] ?? null) : null,
  }));

  return {
    ticket: {
      ...serializeTicket(ticket),
      assigneeName: ticket.assigneeId
        ? (actors[ticket.assigneeId] ?? null)
        : null,
      customerLabel:
        ticket.customerEmail ??
        (ticket.customerId ? (customerRefs[ticket.customerId] ?? null) : null),
    },
    templateVersion: templateVersion
      ? {
          id: templateVersion.id,
          version: templateVersion.version,
          formSchema: parseFormSchema(templateVersion.formSchema),
          invalidatedAt: templateVersion.invalidatedAt,
        }
      : null,
    replies: namedReplies,
    history: namedHistory,
    timeline: [
      ...namedHistory.map((entry) => ({ type: "history" as const, ...entry })),
      ...namedReplies.map((reply) => ({ type: "reply" as const, ...reply })),
    ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    internalStates: internalStateRows
      .filter((state) => !state.archivedAt || valuesByState.has(state.id))
      .map((state) => ({
        ...serializeState(state),
        value: valuesByState.get(state.id)?.value ?? null,
        updatedAt: valuesByState.get(state.id)?.updatedAt ?? null,
        updatedBy: valuesByState.get(state.id)?.updatedBy ?? null,
      })),
  };
}

export async function listMcpTicketAgents(
  ctx: McpGrantContext,
  ticketId: string,
): Promise<Record<string, unknown>> {
  if (
    !hasMcpPermission(ctx, "tickets:assign") &&
    !hasMcpPermission(ctx, "tickets:reassign")
  ) {
    requireMcpPermission(ctx, "tickets:assign");
  }
  const ticket = await loadVisibleTicket(ctx, ticketId);
  if (ctx.role === Role.Agent) {
    requireMcpPermission(ctx, "tickets:reassign");
    await assertAgentMayReassign(ctx, ticket.teamId);
  }
  const rows = await ctx.db
    .select({
      id: users.id,
      displayName: users.displayName,
      level: agents.level,
    })
    .from(agentTeams)
    .innerJoin(agents, eq(agents.userId, agentTeams.userId))
    .innerJoin(users, eq(users.id, agents.userId))
    .where(
      and(
        eq(agentTeams.teamId, ticket.teamId),
        eq(agents.active, true),
        eq(users.tenantId, ticket.tenantId),
      ),
    )
    .orderBy(desc(agents.level), users.displayName);
  return { ticketId: ticket.id, teamId: ticket.teamId, items: rows };
}

export async function replyToMcpTicket(
  ctx: McpGrantContext,
  input: { ticketId: string; content: string; internal: boolean },
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:reply");
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  if (!isOpen(ticket.status) && !input.internal) {
    throw badRequest("Cannot reply to a closed ticket");
  }

  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();
  const statements = [
    ctx.db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderId: ctx.user.id,
      content: input.content,
      internal: input.internal,
      createdAt: now,
    }),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: input.internal ? "internal_note" : "agent_replied",
      createdAt: now,
    }),
  ] as const;

  if (input.internal) {
    await ctx.db.batch([...statements]);
  } else {
    await ctx.db.batch([
      ...statements,
      ctx.db
        .update(tickets)
        .set({
          status: TicketStatus.Replied,
          slaReplyDeadline: null,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticket.id)),
    ]);
    emitTicketEvent(ctx.db, {
      type: "agent_replied",
      ticketId: ticket.id,
      agentId: ctx.user.id,
      replyId,
    });
  }

  return {
    ticketId: ticket.id,
    status: input.internal ? ticket.status : TicketStatus.Replied,
    reply: {
      id: replyId,
      content: input.content,
      internal: input.internal,
      createdAt: now,
    },
  };
}

export async function updateMcpTicketStatus(
  ctx: McpGrantContext,
  input: { ticketId: string; status: TicketStatus },
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:update_status");
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  assertManualStatusTarget(input.status);
  assertTransition(ticket.status, input.status);

  const now = new Date().toISOString();
  let product: typeof products.$inferSelect | undefined;
  if (
    ticket.assigneeId &&
    ticket.status === TicketStatus.New &&
    input.status === TicketStatus.Processing
  ) {
    product = await ctx.db.query.products.findFirst({
      where: eq(products.id, ticket.productId),
    });
  }
  const slaUpdate = statusTransitionSlaUpdate(
    ticket,
    input.status,
    product,
    new Date(now),
  );

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ status: input.status, updatedAt: now, ...slaUpdate })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "status_changed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        newStatus: input.status,
      }),
      createdAt: now,
    }),
  ]);

  return { ticketId: ticket.id, status: input.status, updatedAt: now };
}

export async function updateMcpTicketPriority(
  ctx: McpGrantContext,
  input: { ticketId: string; priority: TicketPriority },
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:update_priority");
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  if (!isOpen(ticket.status)) {
    throw badRequest("Cannot change priority of a closed ticket");
  }
  if (ticket.priority === input.priority) {
    throw badRequest("Priority unchanged");
  }

  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  const slaUpdate = product
    ? ticket.status === TicketStatus.New
      ? computeInitialSlaDeadlines(
          product,
          input.priority,
          false,
          new Date(ticket.createdAt),
        )
      : {
          ...computeSlaDeadlines(
            product,
            input.priority,
            new Date(ticket.createdAt),
          ),
          ...(ticket.status === TicketStatus.Replied
            ? { slaReplyDeadline: null }
            : {}),
        }
    : {};
  const now = new Date().toISOString();

  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ priority: input.priority, updatedAt: now, ...slaUpdate })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "priority_changed",
      snapshot: JSON.stringify({
        previousPriority: ticket.priority,
        newPriority: input.priority,
      }),
      createdAt: now,
    }),
  ]);

  return {
    ticketId: ticket.id,
    priority: input.priority,
    updatedAt: now,
  };
}

export async function assignMcpTicket(
  ctx: McpGrantContext,
  input: {
    ticketId: string;
    assigneeId: string;
    mode: "assign" | "reassign";
  },
): Promise<Record<string, unknown>> {
  requireMcpPermission(
    ctx,
    input.mode === "assign" ? "tickets:assign" : "tickets:reassign",
  );
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  if (!isOpen(ticket.status)) throw badRequest("Cannot assign a closed ticket");

  if (input.mode === "reassign" && ctx.role === Role.Agent) {
    await assertAgentMayReassign(ctx, ticket.teamId);
  }

  const isReassign = Boolean(ticket.assigneeId);
  if (input.mode === "assign" && isReassign) {
    throw badRequest("Ticket is already assigned; use reassign_ticket");
  }
  if (input.mode === "reassign" && !isReassign) {
    throw badRequest("Ticket is unassigned; use assign_ticket");
  }
  if (ticket.assigneeId === input.assigneeId) {
    throw badRequest("Ticket is already assigned to this agent");
  }

  const assignee = await ctx.db
    .select({ userId: agents.userId, tenantId: users.tenantId })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(and(eq(agents.userId, input.assigneeId), eq(agents.active, true)))
    .get();
  if (!assignee) throw badRequest("Assignee not found or inactive");
  if (assignee.tenantId !== ticket.tenantId) {
    throw badRequest("Assignee must belong to the ticket's tenant");
  }
  const inTeam = await ctx.db
    .select({ userId: agentTeams.userId })
    .from(agentTeams)
    .where(
      and(
        eq(agentTeams.userId, input.assigneeId),
        eq(agentTeams.teamId, ticket.teamId),
      ),
    )
    .get();
  if (!inTeam) throw badRequest("Assignee is not in the ticket's team");

  const now = new Date().toISOString();
  let slaReset: Partial<typeof tickets.$inferInsert> = {};
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  if (product && !isReassign && ticket.status === TicketStatus.New) {
    slaReset = restartReplySla(product, ticket.priority, new Date(now));
  } else if (product && isReassign && ticket.status !== TicketStatus.Replied) {
    slaReset = {
      ...computeSlaDeadlines(product, ticket.priority, new Date(now)),
      slaAcceptBreached: false,
      slaReplyBreached: false,
      slaAcceptWarned: false,
      slaReplyWarned: false,
    };
  } else if (isReassign && ticket.status === TicketStatus.Replied) {
    slaReset = { slaReplyDeadline: null };
  }

  const status =
    ticket.status === TicketStatus.New
      ? TicketStatus.Processing
      : ticket.status;
  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({
        assigneeId: input.assigneeId,
        status,
        updatedAt: now,
        ...slaReset,
      })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: isReassign ? "reassigned" : "assigned",
      snapshot: JSON.stringify({
        previousAssignee: ticket.assigneeId,
        newAssignee: input.assigneeId,
      }),
      createdAt: now,
    }),
  ]);
  emitTicketEvent(ctx.db, {
    type: isReassign ? "ticket_reassigned" : "ticket_assigned",
    ticketId: ticket.id,
    agentId: input.assigneeId,
  });

  return {
    ticketId: ticket.id,
    assigneeId: input.assigneeId,
    status,
    updatedAt: now,
  };
}

export async function closeMcpTicket(
  ctx: McpGrantContext,
  input: { ticketId: string; reason?: string },
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:close");
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("Ticket is already closed");
  }
  const now = new Date().toISOString();
  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({ status: TicketStatus.Closed, updatedAt: now })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "closed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        reason: input.reason,
      }),
      createdAt: now,
    }),
  ]);
  emitTicketEvent(ctx.db, {
    type: "ticket_closed",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
  });
  return {
    ticketId: ticket.id,
    status: TicketStatus.Closed,
    updatedAt: now,
  };
}

export async function escalateMcpTicket(
  ctx: McpGrantContext,
  input: { ticketId: string; reason?: string },
): Promise<Record<string, unknown>> {
  requireMcpPermission(ctx, "tickets:escalate");
  const ticket = await loadVisibleTicket(ctx, input.ticketId);
  if (!isOpen(ticket.status)) {
    throw badRequest("Cannot escalate a closed ticket");
  }
  if (ticket.status === TicketStatus.Escalated) {
    throw badRequest("Ticket is already escalated");
  }
  if (ctx.role === Role.Agent && ticket.assigneeId !== ctx.user.id) {
    throw forbidden("Agents can only escalate tickets assigned to them");
  }

  const newAssignee = await chooseEscalationAssignee(
    ctx.db,
    ticket.teamId,
    ticket.assigneeId,
  );
  if (!newAssignee) {
    throw badRequest("No higher-level agent available for escalation");
  }
  const now = new Date().toISOString();
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, ticket.productId),
  });
  const slaReset = product
    ? restartReplySla(product, ticket.priority, new Date(now))
    : {};
  await ctx.db.batch([
    ctx.db
      .update(tickets)
      .set({
        assigneeId: newAssignee.id,
        status: TicketStatus.Escalated,
        updatedAt: now,
        ...slaReset,
      })
      .where(eq(tickets.id, ticket.id)),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: "escalated",
      snapshot: JSON.stringify({
        previousAssignee: ticket.assigneeId,
        newAssignee: newAssignee.id,
        newAssigneeLevel: newAssignee.level,
        reason: input.reason,
      }),
      createdAt: now,
    }),
  ]);
  emitTicketEvent(ctx.db, {
    type: "ticket_escalated",
    ticketId: ticket.id,
    agentId: newAssignee.id,
  });
  return {
    ticketId: ticket.id,
    status: TicketStatus.Escalated,
    updatedAt: now,
    escalatedTo: {
      id: newAssignee.id,
      displayName: newAssignee.displayName,
      level: newAssignee.level,
    },
  };
}
