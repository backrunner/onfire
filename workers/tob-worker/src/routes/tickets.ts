import { Role, TicketPriority, TicketStatus, type TicketFilter, type TicketReply, type TenantID } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { history, replies, tickets, teams } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { bumpLoadCache, chooseEscalationAssignee, pickAssignee } from '../services/allocation';
import { resolveContext } from '../core/context';
import type { Bindings, WorkerSingleton } from '../core/types';

const parseJson = (val: any) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const enrichTicket = (row: any) => {
  if (!row) return row;
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
    metadata: parseJson(row.metadata),
    sla
  };
};

const weightPriority: Record<string, number> = { high: 0, medium: 1, low: 2 };

const maybeUpdateSla = async (db: any, ticket: any) => {
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

const maybeAutoClose = async (db: any, ticket: any, actorId: string | undefined, hours = 72) => {
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

const enrichHistory = (rows: any[]) =>
  (rows ?? []).map((h) => ({
    ...h,
    snapshot: parseJson(h.snapshot)
  }));

const queryTickets = async (db: any, filter: TicketFilter, tenantIds: TenantID[], autoCloseHours = 72) => {
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
  const enriched: any[] = [];
  for (const t of list) {
    let current = await maybeUpdateSla(db, t);
    current = await maybeAutoClose(db, current, undefined, autoCloseHours);
    enriched.push(enrichTicket(current));
  }
  enriched.sort((a, b) => {
    const wDiff = (weightPriority[a.priority] ?? 3) - (weightPriority[b.priority] ?? 3);
    if (wDiff !== 0) return wDiff;
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
  });
  return enriched;
};

export const createTicketRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/tickets', async ({ query, store, user }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');
      const filter: TicketFilter = {
        productId: (query['productId'] as string) ?? undefined,
        teamId: (query['teamId'] as string) ?? undefined,
        status: (query['status'] as TicketStatus) ?? undefined,
        priority: (query['priority'] as TicketPriority) ?? undefined,
        overdue: query['overdue'] === 'true' || query['overdue'] === '1'
      };
      const autoCloseHours = Number(store.env.AUTO_CLOSE_REPLY_HOURS ?? 72);
      const list = await queryTickets(store.db, filter, ctx.tenantIds, Number.isFinite(autoCloseHours) ? autoCloseHours : 72);
      return { data: list, total: list.length };
    })
    .get('/tickets/:id', async ({ params, store, user }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');
      let ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (!ctx.tenantIds.includes(ticket.tenantId as any)) return new Response('forbidden', { status: 403 });
      ticket = await maybeUpdateSla(store.db, ticket);
      ticket = await maybeAutoClose(store.db, ticket, ctx.user.id, Number(store.env.AUTO_CLOSE_REPLY_HOURS ?? 72));
      const replyRows = await store.db.select().from(replies).where(eq(replies.ticketId, params.id)).orderBy(replies.createdAt);
      const historyRows = await store.db.select().from(history).where(eq(history.ticketId, params.id)).orderBy(history.createdAt);
      const timeline = [
        ...enrichHistory(historyRows).map((h) => ({ type: 'history', ...h })),
        ...(replyRows ?? []).map((r: any) => ({ type: 'reply', ...r }))
      ].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      return { ticket: enrichTicket(ticket), replies: replyRows, history: enrichHistory(historyRows), timeline };
    })
    .post('/tickets/:id/status', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { status?: TicketStatus; priority?: TicketPriority; reason?: string };
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });
      const now = new Date().toISOString();
      const nextStatus = body.status ?? ticket.status;
      const nextPriority = body.priority ?? ticket.priority;
      const nextSlaBreached = {
        slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
        slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
      };
      await store.db
        .update(tickets)
        .set({ status: nextStatus, priority: nextPriority, updatedAt: now, ...nextSlaBreached })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
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
      const updated = await store.db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      return { ok: true, ticket: enrichTicket(updated) };
    })
    .post('/tickets/:id/assign', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { assigneeId?: string };
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.assign', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });

      const team = await store.db.query.teams.findFirst({ where: eq(teams.id, ticket.teamId) });
      const allowReassign = team?.allowReassign ?? true;
      const roleAllow = [Role.TeamAdmin, Role.ProductAdmin, Role.TenantAdmin, Role.SuperAdmin].includes(ctx.user.role);
      if (!allowReassign && !roleAllow) return new Response('reassign not allowed', { status: 403 });

      const now = new Date().toISOString();
      const assigneeId = body.assigneeId ?? (await pickAssignee(store.db, ticket.teamId))?.id ?? null;
      await store.db
        .update(tickets)
        .set({ assigneeId, status: TicketStatus.Processing, updatedAt: now })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
        .insert(history)
        .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: ctx.user.id, action: 'assign', snapshot: JSON.stringify({ assigneeId }), createdAt: now })
        .run();
      bumpLoadCache(ticket.teamId, assigneeId);
      const updated = await store.db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      return { ok: true, ticket: enrichTicket(updated) };
    })
    .post('/tickets/:id/priority', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { priority: TicketPriority; reason: string };
      if (!body.priority || !body.reason) return new Response('priority and reason required', { status: 400 });
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });
      const now = new Date().toISOString();
      await store.db.update(tickets).set({ priority: body.priority, updatedAt: now }).where(eq(tickets.id, ticket.id)).run();
      await store.db
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
      const updated = await store.db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      return { ok: true, ticket: enrichTicket(updated) };
    })
    .post('/tickets/:id/close', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { reason?: string };
      if (!body.reason) return new Response('reason required', { status: 400 });
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.close', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });
      const now = new Date().toISOString();
      await store.db
        .update(tickets)
        .set({
          status: TicketStatus.Closed,
          updatedAt: now,
          slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
          slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
        })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
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
      return { ok: true };
    })
    .post('/tickets/status/bulk', async ({ request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { ids?: string[]; status?: TicketStatus; reason?: string };
      if (!body.ids?.length || !body.status) return new Response('ids and status required', { status: 400 });
      if (!body.reason) return new Response('reason required', { status: 400 });
      const rows = await store.db.select().from(tickets).where(inArray(tickets.id, body.ids));
      const now = new Date().toISOString();
      for (const t of rows) {
        assertPermission(ctx, 'ticket.write', { tenantId: t.tenantId as any, teamId: t.teamId as any, productId: t.productId as any });
        const nextSlaBreached = {
          slaAcceptBreached: t.slaAcceptDeadline ? Date.parse(t.slaAcceptDeadline) < Date.now() : false,
          slaReplyBreached: t.slaReplyDeadline ? Date.parse(t.slaReplyDeadline) < Date.now() : false
        };
        await store.db
          .update(tickets)
          .set({ status: body.status, updatedAt: now, ...nextSlaBreached })
          .where(eq(tickets.id, t.id))
          .run();
        await store.db
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
      return { ok: true, count: rows.length };
    })
    .post('/tickets/assign/bulk', async ({ request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { ids?: string[]; assigneeId?: string };
      if (!body.ids?.length || !body.assigneeId) return new Response('ids and assigneeId required', { status: 400 });
      const rows = await store.db.select().from(tickets).where(inArray(tickets.id, body.ids));
      const now = new Date().toISOString();
      for (const t of rows) {
        assertPermission(ctx, 'ticket.assign', { tenantId: t.tenantId as any, teamId: t.teamId as any, productId: t.productId as any });
        await store.db
          .update(tickets)
          .set({ assigneeId: body.assigneeId, status: TicketStatus.Processing, updatedAt: now })
          .where(eq(tickets.id, t.id))
          .run();
        await store.db
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
      return { ok: true, count: rows.length };
    })
    .post('/tickets/:id/escalate', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { reason?: string };
      if (!body.reason) return new Response('reason required', { status: 400 });
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.escalate', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });
      const now = new Date().toISOString();
      const assignee = await chooseEscalationAssignee(store.db, ticket.teamId, ticket.assigneeId);
      if (!assignee) return new Response('no assignee available', { status: 409 });
      await store.db
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
      await store.db
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
      const updated = await store.db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      return { ok: true, ticket: enrichTicket(updated), assignee };
    })
    .post('/tickets/:id/reply', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { content: string; internal?: boolean };
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      assertPermission(ctx, 'ticket.write', { tenantId: ticket.tenantId as any, teamId: ticket.teamId as any, productId: ticket.productId as any });
      const reply: TicketReply = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        senderId: ctx.user.id,
        content: body.content,
        createdAt: new Date().toISOString(),
        internal: body.internal
      };
      await store.db
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
      await store.db
        .update(tickets)
        .set({
          status: TicketStatus.Replied,
          updatedAt: reply.createdAt,
          slaAcceptBreached: ticket.slaAcceptDeadline ? Date.parse(ticket.slaAcceptDeadline) < Date.now() : false,
          slaReplyBreached: ticket.slaReplyDeadline ? Date.parse(ticket.slaReplyDeadline) < Date.now() : false
        })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
        .insert(history)
        .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: ctx.user.id, action: 'agent_replied', createdAt: reply.createdAt })
        .run();
      const refreshed = await store.db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      return { ok: true, ticket: enrichTicket(refreshed), reply };
    });
