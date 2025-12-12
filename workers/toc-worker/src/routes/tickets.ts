import { TicketPriority, TicketStatus } from '@onfire/shared';
import { history, productTeams, replies, tenants, tickets, products, categoryRoutes, customers } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, desc, eq } from 'drizzle-orm';
import { bumpLoadCache, chooseEscalationAssignee, derivePriority, pickAssignee } from '../services/allocation';
import { verifyJwt } from '../core/jwt';
import type { Bindings, WorkerSingleton } from '../core/types';

type PriorityPolicy = Record<
  TicketPriority,
  {
    acceptWithinMinutes: number;
    replyWithinMinutes: number;
  }
>;

const defaultPolicy: PriorityPolicy = {
  high: { acceptWithinMinutes: 5, replyWithinMinutes: 20 },
  medium: { acceptWithinMinutes: 10, replyWithinMinutes: 60 },
  low: { acceptWithinMinutes: 30, replyWithinMinutes: 180 }
};

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
          acceptDeadline: row.slaAcceptDeadline,
          replyDeadline: row.slaReplyDeadline,
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

const calcSla = (priority: TicketPriority, now = new Date(), policy: PriorityPolicy = defaultPolicy) => {
  const rule = policy[priority] ?? defaultPolicy[priority];
  const acceptDeadline = new Date(now.getTime() + rule.acceptWithinMinutes * 60_000);
  const replyDeadline = new Date(now.getTime() + rule.replyWithinMinutes * 60_000);
  return {
    acceptDeadline: acceptDeadline.toISOString(),
    replyDeadline: replyDeadline.toISOString(),
    acceptBreached: false,
    replyBreached: false
  };
};

const verifyTurnstile = async (token: string | undefined, secret: string | undefined) => {
  if (!secret) return true; // 允许本地开发跳过
  if (!token) throw new Error('missing turnstile token');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token })
  });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new Error('turnstile verification failed');
  return true;
};

const chooseTeamForCategory = async (db: any, productId: string, category?: string, subcategory?: string, fallback?: string) => {
  if (!category) return fallback;
  const rows = await db
    .select()
    .from(categoryRoutes)
    .where(and(eq(categoryRoutes.productId, productId), eq(categoryRoutes.category, category)))
    .limit(20);
  if (!rows?.length) return fallback;
  if (subcategory) {
    const found = rows.find((r: any) => r.subcategory === subcategory);
    if (found) return found.teamId;
  }
  return rows[0]?.teamId ?? fallback;
};

const upsertCustomer = async (db: any, payload: { tenantId: string; productId: string; email: string; externalId?: string; level?: number; meta?: any }) => {
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.email, payload.email), eq(customers.productId, payload.productId)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(customers)
      .set({
        externalId: payload.externalId ?? existing[0].externalId,
        level: payload.level ?? existing[0].level,
        meta: payload.meta ? JSON.stringify(payload.meta) : existing[0].meta,
        updatedAt: now
      })
      .where(eq(customers.id, existing[0].id))
      .run();
    return existing[0].id;
  }
  const id = crypto.randomUUID();
  await db
    .insert(customers)
    .values({
      id,
      tenantId: payload.tenantId,
      productId: payload.productId,
      email: payload.email,
      externalId: payload.externalId ?? null,
      level: payload.level ?? null,
      meta: payload.meta ? JSON.stringify(payload.meta) : null,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return id;
};

export const createTicketRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .post('/tickets', async ({ request, store }) => {
      const body = (await request.json()) as Record<string, any>;
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      await verifyTurnstile(body.turnstileToken as string | undefined, store.env.TURNSTILE_SECRET);
      const customerEmail = identity.email ?? (body.customer?.email as string | undefined) ?? '';
      const customerLevel = identity.level ?? (body.customer?.level as number | undefined) ?? undefined;
      const priority = (body.priority as TicketPriority) ?? derivePriority(customerLevel);
      const now = new Date();
      // 读取产品 SLA 配置（分钟），若无配置则回落默认
      const resolvedProductId = (identity.productId as string | undefined) ?? (body.productId as string | undefined) ?? 'demo-product';
      const productRow = await store.db.query.products.findFirst({ where: eq(products.id, resolvedProductId) });
      const metadataPayload = {
        ...(body.metadata ?? {}),
        category: (body.metadata?.category as string | undefined) ?? (body.category as string | undefined),
        subcategory: (body.metadata?.subcategory as string | undefined) ?? (body.subcategory as string | undefined),
        form: (body.metadata?.form as Record<string, unknown> | undefined) ?? (body.form as Record<string, unknown> | undefined),
        customer: { externalId: identity.externalId, meta: identity.meta }
      };
      const policy: PriorityPolicy = {
        high: {
          acceptWithinMinutes: productRow?.slaHighAccept ?? defaultPolicy.high.acceptWithinMinutes,
          replyWithinMinutes: productRow?.slaHighReply ?? defaultPolicy.high.replyWithinMinutes
        },
        medium: {
          acceptWithinMinutes: productRow?.slaMediumAccept ?? defaultPolicy.medium.acceptWithinMinutes,
          replyWithinMinutes: productRow?.slaMediumReply ?? defaultPolicy.medium.replyWithinMinutes
        },
        low: {
          acceptWithinMinutes: productRow?.slaLowAccept ?? defaultPolicy.low.acceptWithinMinutes,
          replyWithinMinutes: productRow?.slaLowReply ?? defaultPolicy.low.replyWithinMinutes
        }
      };
      const sla = calcSla(priority, now, policy);
      const id = crypto.randomUUID();
      const tenantId = identity.tenantId ?? 'demo-tenant';
      const productId = resolvedProductId;
      const prodTeam = await store.db.select({ teamId: productTeams.teamId }).from(productTeams).where(eq(productTeams.productId, productId)).limit(1);
      const tenantDefault = await store.db.select({ teamId: tenants.defaultTeamId }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const category = metadataPayload.category as string | undefined;
      const subcategory = (body.subcategory as string | undefined) ?? (metadataPayload.form as any)?.subcategory;
      const mappedTeam = await chooseTeamForCategory(store.db, productId, category, subcategory, prodTeam[0]?.teamId ?? tenantDefault[0]?.teamId ?? 'team-default');
      const teamId = mappedTeam ?? prodTeam[0]?.teamId ?? tenantDefault[0]?.teamId ?? 'team-default';
      const assignee = await pickAssignee(store.db, teamId);
      await upsertCustomer(store.db, {
        tenantId,
        productId,
        email: customerEmail,
        externalId: identity.externalId,
        level: customerLevel,
        meta: identity.meta
      });
      await store.db
        .insert(tickets)
        .values({
          id,
          tenantId,
          productId,
          teamId,
          assigneeId: assignee?.id ?? null,
          status: TicketStatus.New,
          priority,
          subject: String(body.subject ?? '未命名工单'),
          content: String(body.content ?? ''),
          customerEmail: String(customerEmail),
          customerLevel: customerLevel ?? null,
          templateId: body.templateId ?? null,
          metadata: JSON.stringify(metadataPayload),
          slaAcceptDeadline: sla.acceptDeadline,
          slaReplyDeadline: sla.replyDeadline,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        })
        .run();
      await store.db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: id,
          actorId: null,
          action: 'created',
          snapshot: JSON.stringify({ priority, productId: body.productId }),
          createdAt: now.toISOString()
        })
        .run();
      if (assignee?.id) {
        bumpLoadCache(teamId, assignee.id);
        await store.db
          .insert(history)
          .values({
            id: crypto.randomUUID(),
            ticketId: id,
            actorId: assignee.id,
            action: 'assigned',
            snapshot: JSON.stringify({ assigneeId: assignee.id }),
            createdAt: now.toISOString()
          })
          .run();
      }
      return { ok: true, ticketId: id, assignee };
    })
    .get('/tickets', async ({ query, request, store }) => {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      const productId = query['productId'] as string | undefined;
      const status = query['status'] as TicketStatus | undefined;
      // Filter by tenant AND customer email to prevent viewing other customers' tickets
      const where = [
        eq(tickets.tenantId, identity.tenantId ?? 'demo-tenant'),
        eq(tickets.customerEmail, identity.email ?? '')
      ];
      if (productId) where.push(eq(tickets.productId, productId));
      else if (identity.productId) where.push(eq(tickets.productId, identity.productId));
      if (status) where.push(eq(tickets.status, status));
      const rows = await store.db
        .select()
        .from(tickets)
        .where(and(...where))
        .orderBy(desc(tickets.createdAt))
        .limit(50);
      return { data: rows.map(enrichTicket), total: rows.length };
    })
    .get('/tickets/:id', async ({ params, request, store }) => {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return new Response('forbidden', { status: 403 });
      // Verify ticket belongs to this customer (prevent IDOR)
      if (ticket.customerEmail !== identity.email) return new Response('forbidden', { status: 403 });
      const replyRows = await store.db.select().from(replies).where(eq(replies.ticketId, ticket.id)).orderBy(replies.createdAt);
      const historyRows = await store.db.select().from(history).where(eq(history.ticketId, ticket.id)).orderBy(history.createdAt);
      return { ticket: enrichTicket(ticket), replies: replyRows, history: historyRows };
    })
    .post('/tickets/:id/reply', async ({ params, request, store }) => {
      const body = (await request.json()) as { content: string; turnstileToken?: string };
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      await verifyTurnstile(body.turnstileToken, store.env.TURNSTILE_SECRET);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return new Response('forbidden', { status: 403 });
      // Verify ticket belongs to this customer (prevent IDOR)
      if (ticket.customerEmail !== identity.email) return new Response('forbidden', { status: 403 });
      const now = new Date().toISOString();
      const replyId = crypto.randomUUID();
      await store.db
        .insert(replies)
        .values({
          id: replyId,
          ticketId: ticket.id,
          senderEmail: identity.email ?? ticket.customerEmail,
          content: body.content,
          internal: false,
          createdAt: now
        })
        .run();
      await store.db.update(tickets).set({ status: TicketStatus.Replied, updatedAt: now }).where(eq(tickets.id, ticket.id)).run();
      await store.db
        .insert(history)
        .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: identity.sub ?? null, action: 'customer_replied', createdAt: now })
        .run();
      const replyRows = await store.db.select().from(replies).where(eq(replies.ticketId, ticket.id)).orderBy(replies.createdAt);
      return { ok: true, replies: replyRows };
    })
    .post('/tickets/:id/escalate', async ({ params, request, store }) => {
      // 需要客户 JWT，避免匿名越权升级
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return new Response('forbidden', { status: 403 });
      // Verify ticket belongs to this customer (prevent IDOR)
      if (ticket.customerEmail !== identity.email) return new Response('forbidden', { status: 403 });
      const assignee = await chooseEscalationAssignee(store.db, ticket.teamId, ticket.assigneeId);
      if (!assignee) return new Response('no assignee available', { status: 409 });
      const now = new Date().toISOString();
      await store.db
        .update(tickets)
        .set({ assigneeId: assignee.id, status: TicketStatus.Escalated, updatedAt: now })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: identity.sub ?? identity.email ?? assignee.id,
          action: 'escalated',
          snapshot: JSON.stringify({ assigneeId: assignee.id }),
          createdAt: now
        })
        .run();
      bumpLoadCache(ticket.teamId, assignee.id);
      return { ok: true, assignee };
    })
    .post('/tickets/:id/close', async ({ params, request, store }) => {
      // Customer can close their own ticket
      const body = (await request.json()) as { reason?: string; turnstileToken?: string };
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      await verifyTurnstile(body.turnstileToken, store.env.TURNSTILE_SECRET);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return new Response('forbidden', { status: 403 });
      // Verify ticket belongs to this customer
      if (ticket.customerEmail !== identity.email) return new Response('forbidden', { status: 403 });
      // Only allow closing if not already closed
      if (ticket.status === TicketStatus.Closed) return new Response('ticket already closed', { status: 400 });
      const now = new Date().toISOString();
      await store.db
        .update(tickets)
        .set({ status: TicketStatus.Closed, updatedAt: now })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: identity.sub ?? identity.email ?? null,
          action: 'customer_closed',
          snapshot: JSON.stringify({ reason: body.reason ?? 'Customer closed' }),
          createdAt: now
        })
        .run();
      return { ok: true, status: TicketStatus.Closed };
    })
    .post('/tickets/:id/reopen', async ({ params, request, store }) => {
      // Customer can reopen a closed ticket within 7 days
      const body = (await request.json()) as { reason?: string; turnstileToken?: string };
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, store.env, store.db);
      await verifyTurnstile(body.turnstileToken, store.env.TURNSTILE_SECRET);
      const ticket = await store.db.query.tickets.findFirst({ where: eq(tickets.id, params.id) });
      if (!ticket) return new Response('not found', { status: 404 });
      if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return new Response('forbidden', { status: 403 });
      // Verify ticket belongs to this customer
      if (ticket.customerEmail !== identity.email) return new Response('forbidden', { status: 403 });
      // Only allow reopening closed tickets
      if (ticket.status !== TicketStatus.Closed) return new Response('ticket is not closed', { status: 400 });
      // Check if within 7 days of closure
      const closedAt = new Date(ticket.updatedAt ?? ticket.createdAt);
      const daysSinceClosure = (Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceClosure > 7) return new Response('ticket can only be reopened within 7 days', { status: 400 });
      const now = new Date().toISOString();
      await store.db
        .update(tickets)
        .set({ status: TicketStatus.New, updatedAt: now })
        .where(eq(tickets.id, ticket.id))
        .run();
      await store.db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          actorId: identity.sub ?? identity.email ?? null,
          action: 'customer_reopened',
          snapshot: JSON.stringify({ reason: body.reason ?? 'Customer reopened' }),
          createdAt: now
        })
        .run();
      return { ok: true, status: TicketStatus.New };
    });
