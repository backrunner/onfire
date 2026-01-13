import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { products, productTeams } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { slaColumnsFromPayload, syncProductTeams, type ProductSlaInput } from '../utils';
import { ok } from '../../../core/response';

type ProductRow = typeof products.$inferSelect;
type ProductTeamRow = typeof productTeams.$inferSelect;

export const productRoutes = () => {
  const router = createRouter();

  // GET /products
  router.get('/products', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(products)
        : await db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
    const ids = rows.map((p: ProductRow) => p.id);
    const bindings = ids.length
      ? await db.select().from(productTeams).where(inArray(productTeams.productId, ids))
      : [];
    const teamMap = new Map<string, string[]>();
    bindings.forEach((b: ProductTeamRow) => {
      teamMap.set(b.productId, [...(teamMap.get(b.productId) ?? []), b.teamId]);
    });
    const merged = rows.map((p: ProductRow) => ({ ...p, teamIds: teamMap.get(p.id) ?? [] }));
    return c.json(ok({ data: merged }));
  });

  // POST /products
  router.post('/products', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const body = await c.req.json<{ name: string; tenantId?: string; sla?: ProductSlaInput; teamIds?: string[] }>();
    if (!body.name) {
      return handleResult(c, errorResult(400, 'name required'));
    }

    const tenantId = body.tenantId ?? ctx.tenantIds[0];
    if (!tenantId) {
      return handleResult(c, errorResult(400, 'tenantId required'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    const id = crypto.randomUUID();
    await db
      .insert(products)
      .values({
        id,
        tenantId,
        name: body.name,
        ...slaColumnsFromPayload(body.sla)
      })
      .run();
    if (body.teamIds && body.teamIds.length) {
      await syncProductTeams(db, id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    }
    return c.json(ok({ ok: true, id }));
  });

  // PATCH /products/:id
  router.patch('/products/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; sla?: ProductSlaInput; teamIds?: string[] }>();

    const existing = await db.query.products.findFirst({ where: eq(products.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    const updates = {
      ...(body.name ? { name: body.name } : {}),
      ...slaColumnsFromPayload(body.sla)
    };
    if (!Object.keys(updates).length && !body.teamIds) {
      return handleResult(c, errorResult(400, 'payload required'));
    }
    if (Object.keys(updates).length) {
      await db.update(products).set(updates).where(eq(products.id, id)).run();
    }
    if (body.teamIds) {
      await syncProductTeams(db, id, body.teamIds, ctx.tenantIds, ctx.user.role === Role.SuperAdmin);
    }
    return c.json(ok({ ok: true }));
  });

  // DELETE /products/:id
  router.delete('/products/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'product.manage');

    const id = c.req.param('id');
    const existing = await db.query.products.findFirst({ where: eq(products.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    await db.delete(products).where(eq(products.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
