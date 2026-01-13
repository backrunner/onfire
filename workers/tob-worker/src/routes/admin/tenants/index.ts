import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { tenants } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { ok } from '../../../core/response';

export const tenantRoutes = () => {
  const router = createRouter();

  // GET /tenants
  router.get('/tenants', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'tenant.manage');

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(tenants)
        : await db.select().from(tenants).where(inArray(tenants.id, ctx.tenantIds));
    return c.json(ok({ data: rows }));
  });

  // POST /tenants
  router.post('/tenants', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'tenant.manage');

    const body = await c.req.json<{ name: string }>();
    if (!body.name) {
      return handleResult(c, errorResult(400, 'name required'));
    }

    const id = crypto.randomUUID();
    await db.insert(tenants).values({ id, name: body.name }).run();
    return c.json(ok({ ok: true, id }));
  });

  // PATCH /tenants/:id
  router.patch('/tenants/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string }>();

    const existing = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'tenant.manage', { tenantId: existing.id });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.id as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }
    if (!body.name) {
      return handleResult(c, errorResult(400, 'name required'));
    }

    await db.update(tenants).set({ name: body.name }).where(eq(tenants.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  // DELETE /tenants/:id
  router.delete('/tenants/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const id = c.req.param('id');

    const existing = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    assertPermission(ctx, 'tenant.manage', { tenantId: existing.id });
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.id as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    await db.delete(tenants).where(eq(tenants.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
