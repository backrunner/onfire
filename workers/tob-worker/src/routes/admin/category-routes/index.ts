import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { categoryRoutes } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { assertProductAccessible, assertTeamIdsAccessible } from '../utils';
import { ok } from '../../../core/response';

export const categoryRouteRoutes = () => {
  const router = createRouter();

  // GET /category-routes
  router.get('/category-routes', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'category.map');

    const query = c.req.query();
    const productId = (query['productId'] as string | undefined) ?? undefined;
    const targetProductIds = productId ? [productId] : ctx.productIds;
    if (!targetProductIds.length) {
      return c.json(ok({ data: [] }));
    }

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds))
        : await db.select().from(categoryRoutes).where(inArray(categoryRoutes.productId, targetProductIds));
    return c.json(ok({ data: rows }));
  });

  // POST /category-routes
  router.post('/category-routes', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'category.map');

    const body = await c.req.json<{ productId: string; category: string; subcategory?: string; teamId: string }>();
    if (!body.productId || !body.category || !body.teamId) {
      return handleResult(c, errorResult(400, 'productId, category, teamId required'));
    }

    await assertProductAccessible(db, ctx, body.productId);
    await assertTeamIdsAccessible(db, [body.teamId], ctx.tenantIds, ctx.user.role === Role.SuperAdmin);

    const id = crypto.randomUUID();
    await db
      .insert(categoryRoutes)
      .values({ id, productId: body.productId, category: body.category, subcategory: body.subcategory ?? null, teamId: body.teamId })
      .run();
    return c.json(ok({ ok: true, id }));
  });

  // PATCH /category-routes/:id
  router.patch('/category-routes/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'category.map');

    const id = c.req.param('id');
    const body = await c.req.json<{ category?: string; subcategory?: string | null; teamId?: string }>();

    const existing = await db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }

    await assertProductAccessible(db, ctx, existing.productId);
    if (!body.category && body.subcategory === undefined && !body.teamId) {
      return handleResult(c, errorResult(400, 'payload required'));
    }
    if (body.teamId) {
      await assertTeamIdsAccessible(db, [body.teamId], ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    }

    await db
      .update(categoryRoutes)
      .set({
        ...(body.category ? { category: body.category } : {}),
        ...(body.subcategory !== undefined ? { subcategory: body.subcategory } : {}),
        ...(body.teamId ? { teamId: body.teamId } : {})
      })
      .where(eq(categoryRoutes.id, id))
      .run();
    return c.json(ok({ ok: true }));
  });

  // DELETE /category-routes/:id
  router.delete('/category-routes/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'category.map');

    const id = c.req.param('id');
    const existing = await db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }

    await assertProductAccessible(db, ctx, existing.productId);
    await db.delete(categoryRoutes).where(eq(categoryRoutes.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
