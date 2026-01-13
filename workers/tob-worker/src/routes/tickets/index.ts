import { Role, TicketPriority, TicketStatus, type TicketFilter, type TicketReply, type TenantID } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { history, replies, tickets, teams, type TicketRow, type ReplyRow } from '@onfire/shared/drizzle/schema';
import type { Db } from '@onfire/shared/drizzle/client';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { bumpLoadCache, chooseEscalationAssignee, pickAssignee } from '../../services/allocation';
import { createRouter } from '../../core/router';
import { handleResult, errorResult } from '../../core/route-utils';
import { resolveContext } from '../../core/context';
import { ok } from '../../core/response';

type HistoryRow = typeof history.$inferSelect;

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const enrichTicket = (row: TicketRow | null | undefined): (TicketRow & { metadata: unknown; sla?: { acceptDeadline?: string; replyDeadline?: string; acceptBreached: boolean; replyBreached: boolean } }) | null => {
  if (!row) return null;
  const acceptDeadline = row.slaAcceptDeadline ? Date.parse(row.slaAcceptDeadline) : undefined;
  const replyDeadline = row.slaReplyDeadline ? Date.parse(row.slaReplyDeadline) : undefined;
  const now = Date.now();
  const sla =
    row.slaAcceptDeadline || row.slaReplyDeadline
      ? {
          acceptDeadline: row.slaAcceptDeadline ?? undefined,
          replyDeadline: row.slaReplyDeadline ?? undefined,
          acceptBreached: acceptDeadline ? acceptDeadline < now : false,
          replyBreached: replyDeadline ? replyDeadline < now : false
        }
      : undefined;
  return {
    ...row,
    metadata: parseJson(row.metadata) as string | null,
    sla
  };
};

const weightPriority: Record<string, number> = { high: 0, medium: 1, low: 2 };

const maybeUpdateSla = async (db: Db, ticket: TicketRow | null | undefined) => {
  if (!ticket) return ticket;
  const acceptDeadline = ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) : undefined;
  const replyDeadline = ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) : undefined;
  const now = Date.now();
  const next = {
    slaAcceptBreached: acceptDeadline ? acceptDeadline < now : false,
    slaReplyBreached: replyDeadline ? replyDeadline < now : false
  };
  if (next.slaAcceptBreached !== ticket.slaAcceptBreached || next.slaReplyBreached !== ticket.slaReplyBreached) {
    await db.update(tickets).set(next).where(eq(tickets.id, ticket.id)).run();
    return { ...ticket, ...next };
  }
  return ticket;
};

const maybeAutoClose = async (db: Db, ticket: TicketRow | null | undefined, actorId: string | undefined, hours = 72) => {
  if (!ticket || ticket.status !== TicketStatus.Replied) return ticket;
  const threshold = hours * 60 * 60 * 1000;
  const updatedAt = ticket.updatedAt ? Date.parse(ticket.updatedAt) : 0;
  if (!updatedAt || Date.now() - updatedAt < threshold) return ticket;
  const now = new Date().toISOString();
  await db
    .update(tickets)
    .set({
      status: TicketStatus.Closed,
      updatedAt: now,
      slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
      slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
    })
    .where(eq(tickets.id, ticket.id))
    .run();
  await db
    .insert(history)
    .values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: actorId ?? null,
      action: 'auto_closed',
      snapshot: JSON.stringify({ reason: 'no_customer_reply_timeout' }),
      createdAt: now
    })
    .run();
  return { ...ticket, status: TicketStatus.Closed, updatedAt: now };
};

const enrichHistory = (rows: HistoryRow[]) =>
  (rows ?? []).map((h) => ({
    ...h,
    snapshot: parseJson(h.snapshot)
  }));

const queryTickets = async (db: Db, filter: TicketFilter, tenantIds: TenantID[], autoCloseHours = 72) => {
  const where = [];
  if (tenantIds.length) where.push(inArray(tickets.tenantId, tenantIds));
  if (filter.productId) where.push(eq(tickets.productId, filter.productId));
  if (filter.teamId) where.push(eq(tickets.teamId, filter.teamId));
  if (filter.status) where.push(eq(tickets.status, filter.status));
  if (filter.priority) where.push(eq(tickets.priority, filter.priority));
  if (filter.overdue) where.push(or(eq(tickets.slaAcceptBreached, true), eq(tickets.slaReplyBreached, true)));
  const list = await db
    .select()
    .from(tickets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(100);
  const enriched: ReturnType<typeof enrichTicket>[] = [];
  for (const t of list) {
    let current = await maybeUpdateSla(db, t);
    current = await maybeAutoClose(db, current, undefined, autoCloseHours);
    enriched.push(enrichTicket(current));
  }
  enriched.sort((a, b) => {
    if (!a || !b) return 0;
    const wDiff = (weightPriority[a.priority] ?? 3) - (weightPriority[b.priority] ?? 3);
    if (wDiff !== 0) return wDiff;
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
  });
  return enriched;
};

export const ticketRoutes = () => {
  const router = createRouter();

  // GET /tickets
  router.get('/tickets', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'ticket.read');

    const query = c.req.query();
    const filter: TicketFilter = {
      productId: (query['productId'] as string) ?? undefined,
      teamId: (query['teamId'] as string) ?? undefined,
      status: (query['status'] as TicketStatus) ?? undefined,
      priority: (query['priority'] as TicketPriority) ?? undefined,
      overdue: query['overdue'] === 'true' || query['overdue'] === '1'
    };
    const autoCloseHours = Number(c.env.AUTO_CLOSE_REPLY_HOURS ?? 72);
    const list = await queryTickets(db, filter, ctx.tenantIds, Number.isFinite(autoCloseHours) ? autoCloseHours : 72);
    return c.json(ok({ data: list, total: list.length }));
  });

  // GET /tickets/:id
  router.get('/tickets/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'ticket.read');

    const id = c.req.param('id');
    const ticketResult = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticketResult) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (!ctx.tenantIds.includes(ticketResult.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    let ticket = await maybeUpdateSla(db, ticketResult);
    ticket = await maybeAutoClose(db, ticket, ctx.user.id, Number(c.env.AUTO_CLOSE_REPLY_HOURS ?? 72));
    const replyRows = await db.select().from(replies).where(eq(replies.ticketId, id)).orderBy(replies.createdAt);
    const historyRows = await db.select().from(history).where(eq(history.ticketId, id)).orderBy(history.createdAt);
    const timeline = [
      ...enrichHistory(historyRows).map((h) => ({ type: 'history', ...h })),
      ...(replyRows ?? []).map((r: ReplyRow) => ({ type: 'reply', ...r }))
    ].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    return c.json(ok({ ticket: enrichTicket(ticket), replies: replyRows, history: enrichHistory(historyRows), timeline }));
  });

  // POST /tickets/:id/status
  router.post('/tickets/:id/status', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ status?: TicketStatus; priority?: TicketPriority; reason?: string }>();

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const now = new Date().toISOString();
    const nextStatus = body.status ?? ticket.status;
    const nextPriority = body.priority ?? ticket.priority;
    const nextSlaBreached = {
      slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
      slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
    };
    await db
      .update(tickets)
      .set({ status: nextStatus, priority: nextPriority, updatedAt: now, ...nextSlaBreached })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
      .insert(history)
      .values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: 'status_change',
        snapshot: JSON.stringify({ status: nextStatus, priority: nextPriority, reason: body.reason }),
        createdAt: now
      })
      .run();
    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    return c.json(ok({ ok: true, ticket: enrichTicket(updated) }));
  });

  // POST /tickets/:id/assign
  router.post('/tickets/:id/assign', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ assigneeId?: string }>();

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.assign', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const team = await db.query.teams.findFirst({ where: eq(teams.id, ticket.teamId) });
    const allowReassign = team?.allowReassign ?? true;
    const roleAllow = [Role.TeamAdmin, Role.ProductAdmin, Role.TenantAdmin, Role.SuperAdmin].includes(ctx.user.role);
    if (!allowReassign && !roleAllow) {
      return handleResult(c, errorResult(403, 'reassign not allowed'));
    }

    const now = new Date().toISOString();
    const assigneeId = body.assigneeId ?? (await pickAssignee(db, ticket.teamId))?.id ?? null;
    await db
      .update(tickets)
      .set({ assigneeId, status: TicketStatus.Processing, updatedAt: now })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
      .insert(history)
      .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: ctx.user.id, action: 'assign', snapshot: JSON.stringify({ assigneeId }), createdAt: now })
      .run();
    bumpLoadCache(ticket.teamId, assigneeId);
    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    return c.json(ok({ ok: true, ticket: enrichTicket(updated) }));
  });

  // POST /tickets/:id/priority
  router.post('/tickets/:id/priority', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ priority: TicketPriority; reason: string }>();

    if (!body.priority || !body.reason) {
      return handleResult(c, errorResult(400, 'priority and reason required'));
    }

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const now = new Date().toISOString();
    await db.update(tickets).set({ priority: body.priority, updatedAt: now }).where(eq(tickets.id, ticket.id)).run();
    await db
      .insert(history)
      .values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: 'priority_change',
        snapshot: JSON.stringify({ priority: body.priority, reason: body.reason }),
        createdAt: now
      })
      .run();
    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    return c.json(ok({ ok: true, ticket: enrichTicket(updated) }));
  });

  // POST /tickets/:id/close
  router.post('/tickets/:id/close', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ reason?: string }>();

    if (!body.reason) {
      return handleResult(c, errorResult(400, 'reason required'));
    }

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.close', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const now = new Date().toISOString();
    await db
      .update(tickets)
      .set({
        status: TicketStatus.Closed,
        updatedAt: now,
        slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
        slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
      })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
      .insert(history)
      .values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: 'closed',
        snapshot: JSON.stringify({ reason: body.reason }),
        createdAt: now
      })
      .run();
    return c.json(ok({ ok: true }));
  });

  // POST /tickets/status/bulk
  router.post('/tickets/status/bulk', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const body = await c.req.json<{ ids?: string[]; status?: TicketStatus; reason?: string }>();

    if (!body.ids?.length || !body.status) {
      return handleResult(c, errorResult(400, 'ids and status required'));
    }
    if (!body.reason) {
      return handleResult(c, errorResult(400, 'reason required'));
    }

    const rows = await db.select().from(tickets).where(inArray(tickets.id, body.ids));
    const now = new Date().toISOString();
    for (const t of rows) {
      assertPermission(ctx, 'ticket.write', { tenantId: t.tenantId as any, teamId: t.teamId as any, productId: t.productId as any });
      const nextSlaBreached = {
        slaAcceptBreached: t.slaAcceptDeadline ? Date.parse(t.slaAcceptDeadline) < Date.now() : false,
        slaReplyBreached: t.slaReplyDeadline ? Date.parse(t.slaReplyDeadline) < Date.now() : false
      };
      await db
        .update(tickets)
        .set({ status: body.status, updatedAt: now, ...nextSlaBreached })
        .where(eq(tickets.id, t.id))
        .run();
      await db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: t.id,
          actorId: ctx.user.id,
          action: 'bulk_status_change',
          snapshot: JSON.stringify({ status: body.status, reason: body.reason }),
          createdAt: now
        })
        .run();
    }
    return c.json(ok({ ok: true, count: rows.length }));
  });

  // POST /tickets/assign/bulk
  router.post('/tickets/assign/bulk', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const body = await c.req.json<{ ids?: string[]; assigneeId?: string }>();

    if (!body.ids?.length || !body.assigneeId) {
      return handleResult(c, errorResult(400, 'ids and assigneeId required'));
    }

    const rows = await db.select().from(tickets).where(inArray(tickets.id, body.ids));
    const now = new Date().toISOString();
    for (const t of rows) {
      assertPermission(ctx, 'ticket.assign', { tenantId: t.tenantId as any, teamId: t.teamId as any, productId: t.productId as any });
      await db
        .update(tickets)
        .set({ assigneeId: body.assigneeId, status: TicketStatus.Processing, updatedAt: now })
        .where(eq(tickets.id, t.id))
        .run();
      await db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: t.id,
          actorId: ctx.user.id,
          action: 'bulk_assign',
          snapshot: JSON.stringify({ assigneeId: body.assigneeId }),
          createdAt: now
        })
        .run();
      bumpLoadCache(t.teamId, body.assigneeId);
    }
    return c.json(ok({ ok: true, count: rows.length }));
  });

  // POST /tickets/:id/escalate
  router.post('/tickets/:id/escalate', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ reason?: string }>();

    if (!body.reason) {
      return handleResult(c, errorResult(400, 'reason required'));
    }

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.escalate', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const now = new Date().toISOString();
    const assignee = await chooseEscalationAssignee(db, ticket.teamId, ticket.assigneeId);
    if (!assignee) {
      return handleResult(c, errorResult(409, 'no assignee available'));
    }

    await db
      .update(tickets)
      .set({
        status: TicketStatus.Escalated,
        assigneeId: assignee.id,
        updatedAt: now,
        slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
        slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
      })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
      .insert(history)
      .values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: 'escalated',
        snapshot: JSON.stringify({ reason: body.reason, assigneeId: assignee.id }),
        createdAt: now
      })
      .run();
    bumpLoadCache(ticket.teamId, assignee.id);
    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    return c.json(ok({ ok: true, ticket: enrichTicket(updated), assignee }));
  });

  // POST /tickets/:id/reply
  router.post('/tickets/:id/reply', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ content: string; internal?: boolean }>();

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

    const reply: TicketReply = {
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      senderId: ctx.user.id,
      content: body.content,
      createdAt: new Date().toISOString(),
      internal: body.internal
    };
    await db
      .insert(replies)
      .values({
        id: reply.id,
        ticketId: reply.ticketId,
        senderId: reply.senderId ?? null,
        content: reply.content,
        internal: reply.internal ?? false,
        createdAt: reply.createdAt
      })
      .run();
    await db
      .update(tickets)
      .set({
        status: TicketStatus.Replied,
        updatedAt: reply.createdAt,
        slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
        slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
      })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
      .insert(history)
      .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: ctx.user.id, action: 'agent_replied', createdAt: reply.createdAt })
      .run();
    const refreshed = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    return c.json(ok({ ok: true, ticket: enrichTicket(refreshed), reply }));
  });

  return router;
};
