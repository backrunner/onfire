import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { tenants, products, teams, templates, users, productTeams, productKeys, agents, agentTeams, customers, categoryRoutes, agentProfiles } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, eq, inArray, gte, lte } from 'drizzle-orm';
import { resolveContext } from '../core/context';
import type { Bindings, WorkerSingleton } from '../core/types';

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

const maskApiKey = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

const assertTeamIdsAccessible = async (store: any, teamIds: string[], allowedTenantIds: string[], isSuperAdmin: boolean) => {
  if (!teamIds?.length) return;
  if (isSuperAdmin) return;
  const rows = await store.db.select().from(teams).where(inArray(teams.id, teamIds));
  const invalid = rows.filter((t: any) => !allowedTenantIds.includes(t.tenantId));
  if (invalid.length) throw new Response('forbidden', { status: 403 });
};

const loadAgents = async (store: any, tenantIds: string[], isSuperAdmin: boolean) => {
  const baseSelect = {
    userId: users.id,
    email: users.email,
    displayName: users.displayName,
    tenantId: users.tenantId,
    role: users.role,
    level: agents.level,
    active: agents.active,
    profileName: agentProfiles.displayName,
    profileEmail: agentProfiles.email,
    avatarUrl: agentProfiles.avatarUrl
  };
  const joined =
    isSuperAdmin
      ? await store.db.select(baseSelect).from(agents).leftJoin(users, eq(users.id, agents.userId)).leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
      : await store.db
          .select(baseSelect)
          .from(agents)
          .leftJoin(users, eq(users.id, agents.userId))
          .leftJoin(agentProfiles, eq(agentProfiles.userId, agents.userId))
          .where(inArray(users.tenantId, tenantIds));

  const ids = joined.map((a: any) => a.userId).filter(Boolean);
  const teamRows = ids.length
    ? await store.db.select({ userId: agentTeams.userId, teamId: agentTeams.teamId }).from(agentTeams).where(inArray(agentTeams.userId, ids))
    : [];
  const teamMap = new Map<string, string[]>();
  teamRows.forEach((r: any) => teamMap.set(r.userId, [...(teamMap.get(r.userId) ?? []), r.teamId]));

  return joined.map((a: any) => ({
    userId: a.userId,
    email: a.profileEmail ?? a.email,
    displayName: a.profileName ?? a.displayName,
    tenantId: a.tenantId,
    role: a.role,
    level: a.level ?? 1,
    active: Boolean(a.active ?? true),
    teamIds: teamMap.get(a.userId) ?? [],
    avatarUrl: a.avatarUrl ?? undefined
  }));
};

const upsertAgentProfile = async (store: any, userId: string, profile?: { displayName?: string; email?: string; avatarUrl?: string }) => {
  if (!profile) return;
  const baseUser = await store.db.query.users.findFirst({ where: eq(users.id, userId) });
  const payload = {
    userId,
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {})
  };
  if (Object.keys(payload).length <= 1 && !profile.avatarUrl) return;
  const displayName = payload.displayName ?? baseUser?.displayName ?? 'Agent';
  const email = payload.email ?? baseUser?.email ?? 'unknown@agent';
  await store.db
    .insert(agentProfiles)
    .values({ userId, displayName, email, avatarUrl: profile.avatarUrl ?? null })
    .onConflictDoUpdate({
      target: agentProfiles.userId,
      set: {
        ...(profile.displayName ? { displayName: profile.displayName } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {})
      }
    })
    .run();
};

const parseJsonSafe = (val: string | null) => {
  if (!val) return undefined;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
};

const assertProductAccessible = async (store: any, ctx: any, productId: string) => {
  const existing = await store.db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!existing) throw new Response('not found', { status: 404 });
  if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as any)) throw new Response('forbidden', { status: 403 });
  return existing;
};

export const createAdminRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/admin' })
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
      return {
        data: rows.map((r: any) => ({
          ...r,
          secret: undefined,
          masked: maskApiKey(r.id)
        }))
      };
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
    .get('/agents', async ({ user, store }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'user.manage');
      const data = await loadAgents(store, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
      return { data };
    })
    .patch('/agents/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'agent.profile');
      const body = (await request.json()) as { level?: number; active?: boolean; teamIds?: string[]; displayName?: string; email?: string; avatarUrl?: string };
      const targetUser = await store.db.query.users.findFirst({ where: eq(users.id, params.id) });
      if (!targetUser) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(targetUser.tenantId as any)) return new Response('forbidden', { status: 403 });
      if (body.teamIds) {
        await assertTeamIdsAccessible(store, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
        await store.db.delete(agentTeams).where(eq(agentTeams.userId, params.id)).run();
        if (body.teamIds.length) {
          await store.db.insert(agentTeams).values(body.teamIds.map((t) => ({ userId: params.id, teamId: t }))).run();
        }
      }
      if (body.level !== undefined || body.active !== undefined) {
        await store.db
          .insert(agents)
          .values({ userId: params.id, level: body.level ?? 1, active: body.active ?? true })
          .onConflictDoUpdate({
            target: agents.userId,
            set: {
              ...(body.level !== undefined ? { level: body.level } : {}),
              ...(body.active !== undefined ? { active: body.active } : {})
            }
          })
          .run();
      }
      if (body.displayName || body.email || body.avatarUrl !== undefined) {
        await upsertAgentProfile(store, params.id, { displayName: body.displayName, email: body.email, avatarUrl: body.avatarUrl });
      }
      const refreshed = await loadAgents(store, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
      return { ok: true, data: refreshed };
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
    .get('/category-routes', async ({ user, store, query }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'category.map');
      const productId = (query['productId'] as string | undefined) ?? undefined;
      const targetProductIds = productId ? [productId] : ctx.productIds;
      if (!targetProductIds.length) return { data: [] };
      const rows =
        ctx.user.role === Role.SuperAdmin
          ? await store.db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds))
          : await store.db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds));
      return { data: rows };
    })
    .post('/category-routes', async ({ user, store, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'category.map');
      const body = (await request.json()) as { productId: string; category: string; subcategory?: string; teamId: string };
      if (!body.productId || !body.category || !body.teamId) return new Response('productId, category, teamId required', { status: 400 });
      await assertProductAccessible(store, ctx, body.productId);
      const id = crypto.randomUUID();
      await store.db
        .insert(categoryRoutes)
        .values({ id, productId: body.productId, category: body.category, subcategory: body.subcategory ?? null, teamId: body.teamId })
        .run();
      return { ok: true, id };
    })
    .patch('/category-routes/:id', async ({ user, store, request, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'category.map');
      const body = (await request.json()) as { category?: string; subcategory?: string | null; teamId?: string };
      const existing = await store.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      await assertProductAccessible(store, ctx, existing.productId);
      if (!body.category && body.subcategory === undefined && !body.teamId) return new Response('payload required', { status: 400 });
      await store.db
        .update(categoryRoutes)
        .set({
          ...(body.category ? { category: body.category } : {}),
          ...(body.subcategory !== undefined ? { subcategory: body.subcategory } : {}),
          ...(body.teamId ? { teamId: body.teamId } : {})
        })
        .where(eq(categoryRoutes.id, params.id))
        .run();
      return { ok: true };
    })
    .delete('/category-routes/:id', async ({ user, store, params }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'category.map');
      const existing = await store.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, params.id) });
      if (!existing) return new Response('not found', { status: 404 });
      await assertProductAccessible(store, ctx, existing.productId);
      await store.db.delete(categoryRoutes).where(eq(categoryRoutes.id, params.id)).run();
      return { ok: true };
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
    .patch('/users/:id', async ({ user, store, params, request }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'role.manage');
      const body = (await request.json()) as { role?: Role; displayName?: string; tenantId?: string };
      const target = await store.db.query.users.findFirst({ where: eq(users.id, params.id) });
      if (!target) return new Response('not found', { status: 404 });
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(target.tenantId as any)) return new Response('forbidden', { status: 403 });
      const updates: any = {};
      if (body.role) updates.role = body.role;
      if (body.displayName) updates.displayName = body.displayName;
      if (body.tenantId) {
        if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(body.tenantId as any)) return new Response('forbidden', { status: 403 });
        updates.tenantId = body.tenantId;
      }
      if (!Object.keys(updates).length) return new Response('payload required', { status: 400 });
      await store.db.update(users).set(updates).where(eq(users.id, params.id)).run();
      return { ok: true };
    })
    .get('/customers', async ({ user, store, query }) => {
      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'customer.read');
      const email = (query['email'] as string | undefined) ?? undefined;
      const productId = (query['productId'] as string | undefined) ?? undefined;
      const tenantId = (query['tenantId'] as string | undefined) ?? undefined;
      const levelMin = query['levelMin'] ? Number(query['levelMin']) : undefined;
      const levelMax = query['levelMax'] ? Number(query['levelMax']) : undefined;

      const where = [inArray(customers.tenantId, tenantId ? [tenantId] : ctx.tenantIds)];
      if (email) where.push(eq(customers.email, email));
      if (productId) where.push(eq(customers.productId, productId));
      if (typeof levelMin === 'number' && Number.isFinite(levelMin)) where.push(gte(customers.level, levelMin));
      if (typeof levelMax === 'number' && Number.isFinite(levelMax)) where.push(lte(customers.level, levelMax));

      const rows = await store.db.select().from(customers).where(and(...where));
      const data = rows.map((c: any) => ({
        ...c,
        meta: parseJsonSafe(c.meta)
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
