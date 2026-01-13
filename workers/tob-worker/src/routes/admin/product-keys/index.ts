import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { productKeys, type ProductKeyRow } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { createApiKeyValue, maskApiKey, assertProductAccessible } from '../utils';
import { ok } from '../../../core/response';

export const productKeyRoutes = () => {
  const router = createRouter();

  // GET /product-keys
  router.get('/product-keys', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const productId = c.req.query('productId');
    const targetIds = productId ? [productId] : ctx.productIds;
    if (!targetIds.length) return c.json(ok({ data: [] }));

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(productKeys).where(inArray(productKeys.productId, targetIds))
        : await db.select().from(productKeys).where(inArray(productKeys.productId, targetIds));

    return c.json(ok({
      data: rows.map((r: ProductKeyRow) => ({
        ...r,
        secret: undefined,
        masked: maskApiKey(r.id)
      }))
    }));
  });

  // POST /product-keys
  router.post('/product-keys', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const body = await c.req.json<{ productId: string; name?: string }>();
    if (!body.productId) {
      return handleResult(c, errorResult(400, 'productId required'));
    }

    const product = await assertProductAccessible(db, ctx, body.productId);
    const { id, secret, apiKey } = createApiKeyValue();
    const now = new Date().toISOString();

    await db
      .insert(productKeys)
      .values({ id, productId: product.id, name: body.name ?? null, secret, createdAt: now, revoked: false })
      .run();

    return c.json(ok({ ok: true, id, productId: product.id, apiKey }));
  });

  // POST /product-keys/:id/rotate
  router.post('/product-keys/:id/rotate', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const existing = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }

    await assertProductAccessible(db, ctx, existing.productId);
    const { secret, apiKey } = createApiKeyValue();
    const now = new Date().toISOString();

    await db.update(productKeys).set({ secret, createdAt: now, lastUsedAt: null, revoked: false }).where(eq(productKeys.id, id)).run();

    return c.json(ok({ ok: true, id: existing.id, apiKey }));
  });

  // PATCH /product-keys/:id/revoke
  router.patch('/product-keys/:id/revoke', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const body = await c.req.json<{ revoked?: boolean }>();

    const existing = await db.query.productKeys.findFirst({ where: eq(productKeys.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }

    await assertProductAccessible(db, ctx, existing.productId);
    await db.update(productKeys).set({ revoked: body.revoked ?? true }).where(eq(productKeys.id, id)).run();

    return c.json(ok({ ok: true }));
  });

  return router;
};
