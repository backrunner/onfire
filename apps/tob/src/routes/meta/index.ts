import { products, teams } from '@onfire/shared/drizzle/schema';
import { inArray } from 'drizzle-orm';
import { createRouter } from '../../core/router';
import { resolveContext } from '../../core/context';
import { ok } from '../../core/response';

export const metaRoutes = () => {
  const router = createRouter();

  // GET /meta/teams
  router.get('/meta/teams', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const rows = await db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
    return c.json(ok({ data: rows }));
  });

  // GET /meta/products
  router.get('/meta/products', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    const rows = await db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
    return c.json(ok({ data: rows }));
  });

  return router;
};
