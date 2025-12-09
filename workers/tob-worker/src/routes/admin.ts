import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { tenants, products, teams, templates, users, productTeams, productKeys } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, eq, inArray } from 'drizzle-orm';
import { resolveContext } from '../core/context';
import type { Bindings } from '../core/types';

type ProductSlaInput = {
  highAccept?: number;
  highReply?: number;
  mediumAccept?: number;
  mediumReply?: number;
  lowAccept?: number;
  lowReply?: number;
};

const slaColumnsFromPayload = (sla?: ProductSlaInput) =>
  sla
    ? {
        ...(sla.highAccept !== undefined ? { slaHighAccept: sla.highAccept } : {}),
        ...(sla.highReply !== undefined ? { slaHighReply: sla.highReply } : {}),
        ...(sla.mediumAccept !== undefined ? { slaMediumAccept: sla.mediumAccept } : {}),
        ...(sla.mediumReply !== undefined ? { slaMediumReply: sla.mediumReply } : {}),
        ...(sla.lowAccept !== undefined ? { slaLowAccept: sla.lowAccept } : {}),
        ...(sla.lowReply !== undefined ? { slaLowReply: sla.lowReply } : {})
      }
    : {};

const syncProductTeams = async (store: any, productId: string, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds) return;
  if (!isSuperAdmin) {
    // 校验团队必须属于当前可见租户
    const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
    const invalid = rows.filter((t: any) => !allowedTenantIds.includes(t.tenantId));
    if (invalid.length) throw new Response('forbidden', { status: 403 });
  }
  await store.db.delete(productTeams).where(eq(productTeams.productId, productId)).run();
  if (teamIds.length === 0) return;
  await store.db
    .insert(productTeams)
    .values(teamIds.map((tid) => ({ productId, teamId: tid })))
    .run();
};

const createApiKeyValue = () => {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  return { id, secret, apiKey: `${id}.${secret}` };
};

const assertProductAccessible = async (store: any, ctx: any, productId: string) => {
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!existing) throw new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) throw new Response('forbidden', { status: 403 });
  return existing;
};

export const createAdminRoutes = (env: Bindings) =>
  new Elysia({ prefix: '/admin' })
    .get('/tenants', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'tenant.manage');
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(tenants)
          : await store.db.select().from(tenants).where(inArray(tenants.id, ctx.tenantIds));
      return { data: rows };
    })
    .get('/products', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(products)
          : await store.db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
      const ids = rows.map((p) => p.id);
      const bindings = ids.length
        ? await store.db.select().from(productTeams).where(inArray(productTeams.productId, ids))
        : [];
      const teamMap = new Map<string, string[]>();
      bindings.forEach((b) => {
        teamMap.set(b.productId, [...(teamMap.get(b.productId) ?? []), b.teamId]);
      });
      const merged = rows.map((p) => ({ ...p, teamIds: teamMap.get(p.id) ?? [] }));
      return { data: merged };
    })
    .get('/product-keys', async ({ user, store, query }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const productId = query['productId'] as string | undefined;
      const targetIds = productId ? [productId] : ctx.productIds;
      if (!targetIds.length) return { data: [] };
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(productKeys).where(inArray(productKeys.productId, targetIds))
          : await store.db
              .select()
              .from(productKeys)
              .where(inArray(productKeys.productId, targetIds));
      return { data: rows.map((r: any) => ({ ...r, secret: undefined })) };
    })
    .post('/product-keys', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const body = (await request.json()) as { productId: string; name?: string };
      if (!body.productId) return new Response('productId required', { status: 400 });
      const product = await assertProductAccessible(store, ctx, body.productId);
      const { id, secret, apiKey } = createApiKeyValue();
      const now = new Date().toISOString();
      await store.db
        .insert(productKeys)
        .values({ id, productId: product.id, name: body.name ?? null, secret, createdAt: now, revoked: false })
        .run();
      return { ok: true, id, productId: product.id, apiKey };
    })
    .post('/product-keys/:id/rotate', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const existing = await store.db.query.productKeys.findFirst({ where: eq(productKeys.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      await assertProductAccessible(store, ctx, existing.productId);
      const { secret, apiKey } = createApiKeyValue();
      const now = new Date().toISOString();
      await store.db.update(productKeys).set({ secret, createdAt: now, lastUsedAt: null, revoked: false }).where(eq(productKeys.id, params.id)).run();
      return { ok: true, id: existing.id, apiKey };
    })
    .patch('/product-keys/:id/revoke', async ({ user, store, params, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const body = (await request.json().catch(() => ({}))) as { revoked?: boolean };
      const existing = await store.db.query.productKeys.findFirst({ where: eq(productKeys.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      await assertProductAccessible(store, ctx, existing.productId);
      await store.db.update(productKeys).set({ revoked: body.revoked ?? true }).where(eq(productKeys.id, params.id)).run();
      return { ok: true };
    })
    .get('/teams', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'team.manage');
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(teams)
          : await store.db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
      return { data: rows };
    })
    .get('/templates', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'template.read');
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(templates)
          : await store.db.select().from(templates).where(inArray(templates.productId, ctx.productIds));
      return { data: rows };
    })
    .get('/users', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'user.manage');
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(users)
          : await store.db.select().from(users).where(inArray(users.tenantId, ctx.tenantIds));
      return { data: rows };
    })
    .get('/customers', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');
      const rows = await store.db
        .select({
          email: tickets.customerEmail,
          level: tickets.customerLevel,
          tenantId: tickets.tenantId,
          productId: tickets.productId
        })
        .from(tickets)
        .where(inArray(tickets.tenantId, ctx.tenantIds));
      const map = new Map<
        string,
        {
          email: string;
          tenantIds: Set<string>;
          productIds: Set<string>;
          maxLevel?: number | null;
          count: number;
        }
      >();
      rows.forEach((r: any) => {
        const key = r.email;
        if (!map.has(key)) {
          map.set(key, { email: key, tenantIds: new Set(), productIds: new Set(), maxLevel: r.level ?? null, count: 0 });
        }
        const entry = map.get(key)!;
        entry.count += 1;
        if (r.level !== null && r.level !== undefined) {
          entry.maxLevel = entry.maxLevel !== null && entry.maxLevel !== undefined ? Math.max(entry.maxLevel, r.level) : r.level;
        }
        if (r.tenantId) entry.tenantIds.add(r.tenantId);
        if (r.productId) entry.productIds.add(r.productId);
      });
      const data = Array.from(map.values()).map((v) => ({
        email: v.email,
        maxLevel: v.maxLevel,
        count: v.count,
        tenantIds: Array.from(v.tenantIds),
        productIds: Array.from(v.productIds)
      }));
      return { data };
    })
    .post('/tenants', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'tenant.manage');
      const body = (await request.json()) as { name: string };
      if (!body.name) return new Response('name required', { status: 400 });
      const id = crypto.randomUUID();
      await store.db.insert(tenants).values({ id, name: body.name }).run();
      return { ok: true, id };
    })
    .post('/products', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const body = (await request.json()) as { name: string; tenantId?: string; sla?: ProductSlaInput; teamIds?: string[] };
      if (!body.name) return new Response('name required', { status: 400 });
      const tenantId = body.tenantId ?? ctx.tenantIds[0];
      if (!tenantId) return new Response('tenantId required', { status: 400 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(tenantId as any)) return new Response('forbidden', { status: 403 });
      const id = crypto.randomUUID();
      await store.db
        .insert(products)
        .values({
          id,
          tenantId,
          name: body.name,
          ...slaColumnsFromPayload(body.sla)
        })
        .run();
      if (body.teamIds && body.teamIds.length) {
        await syncProductTeams(store, id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
      }
      return { ok: true, id };
    })
    .patch('/products/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const existing = await store.db.query.products.findFirst({ where: eq(products.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) return new Response('forbidden', { status: 403 });
      const body = (await request.json()) as { name?: string; sla?: ProductSlaInput; teamIds?: string[] };
      const updates = {
        ...(body.name ? { name: body.name } : {}),
        ...slaColumnsFromPayload(body.sla)
      };
      if (!Object.keys(updates).length && !body.teamIds) return new Response('payload required', { status: 400 });
      if (Object.keys(updates).length) {
        await store.db.update(products).set(updates).where(eq(products.id, params.id)).run();
      }
      if (body.teamIds) {
        await syncProductTeams(store, params.id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
      }
      return { ok: true };
    })
    .delete('/products/:id', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'product.manage');
      const existing = await store.db.query.products.findFirst({ where: eq(products.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) return new Response('forbidden', { status: 403 });
      await store.db.delete(products).where(eq(products.id, params.id)).run();
      return { ok: true };
    })
    .post('/teams', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'team.manage');
      const body = (await request.json()) as { name: string; allowReassign?: boolean; tenantId?: string };
      if (!body.name) return new Response('name required', { status: 400 });
      const tenantId = body.tenantId ?? ctx.tenantIds[0];
      if (!tenantId) return new Response('tenantId required', { status: 400 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(tenantId as any)) return new Response('forbidden', { status: 403 });
      const id = crypto.randomUUID();
      await store.db.insert(teams).values({ id, tenantId, name: body.name, allowReassign: body.allowReassign ?? true }).run();
      return { ok: true, id };
    })
    .patch('/teams/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'team.manage');
      const existing = await store.db.query.teams.findFirst({ where: eq(teams.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) return new Response('forbidden', { status: 403 });
      const body = (await request.json()) as { name?: string; allowReassign?: boolean };
      await store.db
        .update(teams)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.allowReassign === undefined ? {} : { allowReassign: body.allowReassign })
        })
        .where(eq(teams.id, params.id))
        .run();
      return { ok: true };
    })
    .delete('/teams/:id', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'team.manage');
      const existing = await store.db.query.teams.findFirst({ where: eq(teams.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) return new Response('forbidden', { status: 403 });
      await store.db.delete(teams).where(eq(teams.id, params.id)).run();
      return { ok: true };
    })
    .post('/templates', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'template.write');
      const body = (await request.json()) as { productId: string; title: string; categories: string; formSchema: string };
      if (!body.productId || !body.title) return new Response('productId and title required', { status: 400 });
      if (!ctx.productIds.includes(body.productId)) return new Response('forbidden', { status: 403 });
      let parsedSchema: any = null;
      try {
        parsedSchema = JSON.parse(body.formSchema ?? '{}');
      } catch {
        return new Response('invalid formSchema json', { status: 400 });
      }
      const fields: any[] = Array.isArray(parsedSchema) ? parsedSchema : parsedSchema.fields;
      const hasTextarea = Array.isArray(fields) && fields.some((f) => f.type === 'textarea' || f.type === 'longtext');
      const ensuredSchema = hasTextarea
        ? parsedSchema
        : {
            ...(Array.isArray(parsedSchema) ? { fields: parsedSchema } : parsedSchema),
            fields: [
              {
                label: '问题详情',
                key: 'content',
                type: 'textarea',
                required: true,
                placeholder: '请详细描述问题、步骤、期望'
              },
              ...(Array.isArray(fields) ? fields : [])
            ]
          };
      const id = crypto.randomUUID();
      await store.db
        .insert(templates)
        .values({
          id,
          productId: body.productId,
          title: body.title,
          categories: body.categories ?? '[]',
          formSchema: JSON.stringify(ensuredSchema)
        })
        .run();
      return { ok: true, id };
    })
    .patch('/templates/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'template.write');
      const existing = await store.db.query.templates.findFirst({ where: eq(templates.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as any)) return new Response('forbidden', { status: 403 });
      const body = (await request.json()) as { title?: string; categories?: string; formSchema?: string };
      let parsedSchema: any = null;
      if (body.formSchema) {
        try {
          parsedSchema = JSON.parse(body.formSchema);
        } catch {
          return new Response('invalid formSchema json', { status: 400 });
        }
      }
      const fields: any[] =
        parsedSchema !== null ? (Array.isArray(parsedSchema) ? parsedSchema : parsedSchema.fields) : (() => {
            try { return JSON.parse(existing.formSchema).fields; } catch { return []; }
          })();
      const hasTextarea = Array.isArray(fields) && fields.some((f) => f.type === 'textarea' || f.type === 'longtext');
      const ensuredSchema =
        parsedSchema !== null
          ? hasTextarea
            ? parsedSchema
            : {
                ...(Array.isArray(parsedSchema) ? { fields: parsedSchema } : parsedSchema),
                fields: [
                  {
                    label: '问题详情',
                    key: 'content',
                    type: 'textarea',
                    required: true,
                    placeholder: '请详细描述问题、步骤、期望'
                  },
                  ...(Array.isArray(fields) ? fields : [])
                ]
              }
          : undefined;
      await store.db
        .update(templates)
        .set({
          ...(body.title ? { title: body.title } : {}),
          ...(body.categories ? { categories: body.categories } : {}),
          ...(ensuredSchema ? { formSchema: JSON.stringify(ensuredSchema) } : {})
        })
        .where(eq(templates.id, params.id))
        .run();
      return { ok: true };
    })
    .delete('/templates/:id', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'template.write');
      const existing = await store.db.query.templates.findFirst({ where: eq(templates.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.productIds.includes(existing.productId as any)) return new Response('forbidden', { status: 403 });
      await store.db.delete(templates).where(eq(templates.id, params.id)).run();
      return { ok: true };
    })
    .patch('/tenants/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'tenant.manage', { tenantId: params.id });
      const body = (await request.json()) as { name?: string };
      if (!body.name) return new Response('name required', { status: 400 });
      await store.db.update(tenants).set({ name: body.name }).where(eq(tenants.id, params.id)).run();
      return { ok: true };
    })
    .delete('/tenants/:id', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'tenant.manage', { tenantId: params.id });
      await store.db.delete(tenants).where(eq(tenants.id, params.id)).run();
      return { ok: true };
    });
