import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { teams } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { ok } from '../../../core/response';

export const teamRoutes = () => {
  const router = createRouter();

  // GET /teams
  router.get('/teams', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'team.manage');

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(teams)
        : await db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
    return c.json(ok({ data: rows }));
  });

  // POST /teams
  router.post('/teams', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'team.manage');

    const body = await c.req.json<{ name: string; allowReassign?: boolean; tenantId?: string }>();
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
    await db.insert(teams).values({ id, tenantId, name: body.name, allowReassign: body.allowReassign ?? true }).run();
    return c.json(ok({ ok: true, id }));
  });

  // PATCH /teams/:id
  router.patch('/teams/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'team.manage');

    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; allowReassign?: boolean }>();

    const existing = await db.query.teams.findFirst({ where: eq(teams.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    await db
      .update(teams)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.allowReassign === undefined ? {} : { allowReassign: body.allowReassign })
      })
      .where(eq(teams.id, id))
      .run();
    return c.json(ok({ ok: true }));
  });

  // DELETE /teams/:id
  router.delete('/teams/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'team.manage');

    const id = c.req.param('id');
    const existing = await db.query.teams.findFirst({ where: eq(teams.id, id) });
    if (!existing) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(existing.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    await db.delete(teams).where(eq(teams.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
