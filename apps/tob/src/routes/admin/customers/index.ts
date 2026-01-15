import { assertPermission } from '@onfire/shared/rbac';
import { customers, type CustomerRow } from '@onfire/shared/drizzle/schema';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { resolveContext } from '../../../core/context';
import { parseJsonSafe } from '../utils';
import { ok } from '../../../core/response';

export const customerRoutes = () => {
  const router = createRouter();

  // GET /customers
  router.get('/customers', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'customer.read');

    const query = c.req.query();
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

    const rows = await db.select().from(customers).where(and(...where));
    const data = rows.map((c: CustomerRow) => ({
      ...c,
      meta: parseJsonSafe(c.meta)
    }));
    return c.json(ok({ data }));
  });

  return router;
};
