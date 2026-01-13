import { TicketPriority, TicketStatus } from '@onfire/shared';
import { history, productTeams, replies, tenants, tickets, products, categoryRoutes, customers, templates } from '@onfire/shared/drizzle/schema';
import { and, desc, eq } from 'drizzle-orm';
import { bumpLoadCache, chooseEscalationAssignee, derivePriority, pickAssignee } from '../../services/allocation';
import { verifyJwt } from '../../core/jwt';
import { createRouter } from '../../core/router';
import type { Db } from '@onfire/shared/drizzle/client';

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
  if (!secret) return true;
  if (!token) throw new Error('missing turnstile token');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token })
  });
  const data = (await res.json()) as { success?: boolean };
  if (!data.success) throw new Error('turnstile verification failed');
  return true;
};

const chooseTeamForCategory = async (db: Db, productId: string, category?: string, subcategory?: string, fallback?: string) => {
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

const upsertCustomer = async (db: Db, payload: { tenantId: string; productId: string; email: string; externalId?: string; level?: number; meta?: any }) => {
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

export const ticketRoutes = () => {
  const router = createRouter();

  // GET /templates
  router.get('/templates', async (c) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    const productId = c.req.query('productId') ?? identity.productId;
    const rows = productId
      ? await db.select().from(templates).where(eq(templates.productId, productId))
      : await db.select().from(templates);
    return c.json(rows.map((t: any) => ({
      ...t,
      categories: parseJson(t.categories ?? '[]'),
      formSchema: parseJson(t.formSchema ?? '{}')
    })));
  });

  // POST /tickets
  router.post('/tickets', async (c) => {
    const body = (await c.req.json()) as Record<string, any>;
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    await verifyTurnstile(body.turnstileToken as string | undefined, c.env.TURNSTILE_SECRET);
    const customerEmail = identity.email ?? (body.customer?.email as string | undefined) ?? '';
    const customerLevel = identity.level ?? (body.customer?.level as number | undefined) ?? undefined;
    const priority = (body.priority as TicketPriority) ?? derivePriority(customerLevel);
    const now = new Date();
    const resolvedProductId = (identity.productId as string | undefined) ?? (body.productId as string | undefined) ?? 'demo-product';
    const productRow = await db.query.products.findFirst({ where: eq(products.id, resolvedProductId) });
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
    const prodTeam = await db.select({ teamId: productTeams.teamId }).from(productTeams).where(eq(productTeams.productId, productId)).limit(1);
    const tenantDefault = await db.select({ teamId: tenants.defaultTeamId }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const category = metadataPayload.category as string | undefined;
    const subcategory = (body.subcategory as string | undefined) ?? (metadataPayload.form as any)?.subcategory;
    const mappedTeam = await chooseTeamForCategory(db, productId, category, subcategory, prodTeam[0]?.teamId ?? tenantDefault[0]?.teamId ?? 'team-default');
    const teamId = mappedTeam ?? prodTeam[0]?.teamId ?? tenantDefault[0]?.teamId ?? 'team-default';
    const assignee = await pickAssignee(db, teamId);
    await upsertCustomer(db, {
      tenantId,
      productId,
      email: customerEmail,
      externalId: identity.externalId,
      level: customerLevel,
      meta: identity.meta
    });
    await db
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
    await db
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
      await db
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
    return c.json({ ok: true, ticketId: id, assignee });
  });

  // GET /tickets
  router.get('/tickets', async (c) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    const productId = c.req.query('productId');
    const status = c.req.query('status') as TicketStatus | undefined;
    const where = [
      eq(tickets.tenantId, identity.tenantId ?? 'demo-tenant'),
      eq(tickets.customerEmail, identity.email ?? '')
    ];
    if (productId) where.push(eq(tickets.productId, productId));
    else if (identity.productId) where.push(eq(tickets.productId, identity.productId));
    if (status) where.push(eq(tickets.status, status));
    const rows = await db
      .select()
      .from(tickets)
      .where(and(...where))
      .orderBy(desc(tickets.createdAt))
      .limit(50);
    return c.json({ data: rows.map(enrichTicket), total: rows.length });
  });

  // GET /tickets/:id
  router.get('/tickets/:id', async (c) => {
    const id = c.req.param('id');
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return c.json({ error: 'not found' }, 404);
    if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return c.json({ error: 'forbidden' }, 403);
    if (ticket.customerEmail !== identity.email) return c.json({ error: 'forbidden' }, 403);
    const replyRows = await db.select().from(replies).where(eq(replies.ticketId, ticket.id)).orderBy(replies.createdAt);
    const historyRows = await db.select().from(history).where(eq(history.ticketId, ticket.id)).orderBy(history.createdAt);
    return c.json({ ticket: enrichTicket(ticket), replies: replyRows, history: historyRows });
  });

  // POST /tickets/:id/reply
  router.post('/tickets/:id/reply', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { content: string; turnstileToken?: string };
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return c.json({ error: 'not found' }, 404);
    if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return c.json({ error: 'forbidden' }, 403);
    if (ticket.customerEmail !== identity.email) return c.json({ error: 'forbidden' }, 403);
    const now = new Date().toISOString();
    const replyId = crypto.randomUUID();
    await db
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
    await db.update(tickets).set({ status: TicketStatus.Replied, updatedAt: now }).where(eq(tickets.id, ticket.id)).run();
    await db
      .insert(history)
      .values({ id: crypto.randomUUID(), ticketId: ticket.id, actorId: identity.sub ?? null, action: 'customer_replied', createdAt: now })
      .run();
    const replyRows = await db.select().from(replies).where(eq(replies.ticketId, ticket.id)).orderBy(replies.createdAt);
    return c.json({ ok: true, replies: replyRows });
  });

  // POST /tickets/:id/escalate
  router.post('/tickets/:id/escalate', async (c) => {
    const id = c.req.param('id');
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return c.json({ error: 'not found' }, 404);
    if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return c.json({ error: 'forbidden' }, 403);
    if (ticket.customerEmail !== identity.email) return c.json({ error: 'forbidden' }, 403);
    const assignee = await chooseEscalationAssignee(db, ticket.teamId, ticket.assigneeId);
    if (!assignee) return c.json({ error: 'no assignee available' }, 409);
    const now = new Date().toISOString();
    await db
      .update(tickets)
      .set({ assigneeId: assignee.id, status: TicketStatus.Escalated, updatedAt: now })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
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
    return c.json({ ok: true, assignee });
  });

  // POST /tickets/:id/close
  router.post('/tickets/:id/close', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { reason?: string; turnstileToken?: string };
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return c.json({ error: 'not found' }, 404);
    if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return c.json({ error: 'forbidden' }, 403);
    if (ticket.customerEmail !== identity.email) return c.json({ error: 'forbidden' }, 403);
    if (ticket.status === TicketStatus.Closed) return c.json({ error: 'ticket already closed' }, 400);
    const now = new Date().toISOString();
    await db
      .update(tickets)
      .set({ status: TicketStatus.Closed, updatedAt: now })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
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
    return c.json({ ok: true, status: TicketStatus.Closed });
  });

  // POST /tickets/:id/reopen
  router.post('/tickets/:id/reopen', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { reason?: string; turnstileToken?: string };
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);
    const db = c.get('db');
    const identity = await verifyJwt(token, c.env, db);
    await verifyTurnstile(body.turnstileToken, c.env.TURNSTILE_SECRET);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return c.json({ error: 'not found' }, 404);
    if (ticket.tenantId !== (identity.tenantId ?? 'demo-tenant')) return c.json({ error: 'forbidden' }, 403);
    if (ticket.customerEmail !== identity.email) return c.json({ error: 'forbidden' }, 403);
    if (ticket.status !== TicketStatus.Closed) return c.json({ error: 'ticket is not closed' }, 400);
    const closedAt = new Date(ticket.updatedAt ?? ticket.createdAt);
    const daysSinceClosure = (Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceClosure > 7) return c.json({ error: 'ticket can only be reopened within 7 days' }, 400);
    const now = new Date().toISOString();
    await db
      .update(tickets)
      .set({ status: TicketStatus.New, updatedAt: now })
      .where(eq(tickets.id, ticket.id))
      .run();
    await db
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
    return c.json({ ok: true, status: TicketStatus.New });
  });

  return router;
};
