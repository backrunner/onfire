import { Role, TicketPriority, TicketStatus, type TicketFilter, type TicketReply, type TenantID } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { history, replies, tickets, teams } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { bumpLoadCache, chooseEscalationAssignee, pickAssignee } from '../services/allocation';
import { resolveContext } from '../core/context';
import type { Bindings } from '../core/types';

const queryTickets = async (db: any, filter: TicketFilter, tenantIds: TenantID[]) => {
  const where = [];
  if (tenantIds.length) where.push(inArray(tickets.tenantId, tenantIds));
  if (filter.productId) where.push(eq(tickets.productId, filter.productId));
  if (filter.teamId) where.push(eq(tickets.teamId, filter.teamId));
  if (filter.status) where.push(eq(tickets.status, filter.status));
  if (filter.priority) where.push(eq(tickets.priority, filter.priority));
  if (filter.overdue) where.push(or(eq(tickets.slaAcceptBreached, true), eq(tickets.slaReplyBreached, true)));
  return db
    .select()
    .from(tickets)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(100);
};

export const createTicketRoutes = (env: Bindings) =>
  new Elysia()
    .get('/tickets', async ({ query, store, user }) => {
      const ctx = await resolveContext(env, user);
      const filter: TicketFilter = {
        productId: (query['productId'] as string) ?? undefined,
        teamId: (query['teamId'] as string) ?? undefined,
        status: (query['status'] as TicketStatus) ?? undefined,
        priority: (query['priority'] as TicketPriority) ?? undefined,
        overdue: query['overdue'] === 'true' || query['overdue'] === '1'
      };
      const list = await queryTickets(store.db, filter, ctx.tenantIds);
      return { data: list, total: list.length };
    })
    .get('/tickets/:id', async ({ params, store, user }) => {
      const ctx = await resolveContext(env, user);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (!ctx.tenantIds.includes(ticket.tenantId as any)) return new Response('forbidden', { status: 403 });
      const replyRows = await store.db.select().from(replies).where(eq(replies.ticketId, params.id)).orderBy(replies.createdAt);
      const historyRows = await store.db.select().from(history).where(eq(history.ticketId, params.id)).orderBy(history.createdAt);
      return { ticket, replies: replyRows, history: historyRows };
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
      return { ok: true, ticket: updated };
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
      return { ok: true, ticket: updated };
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
      return { ok: true, ticket: updated };
    })
    .post('/tickets/:id/close', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { reason?: string };
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
    .post('/tickets/:id/escalate', async ({ params, request, user, store }) => {
      const ctx = await resolveContext(env, user);
      const body = (await request.json()) as { reason?: string };
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
      return { ok: true, ticket: updated, assignee };
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
      return { ok: true, ticket: { ...ticket, status: TicketStatus.Replied, updatedAt: reply.createdAt }, reply };
    });
