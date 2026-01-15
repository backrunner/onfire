import { Role } from '@onfire/shared';
import { assertPermission } from '@onfire/shared/rbac';
import { users } from '@onfire/shared/drizzle/schema';
import { eq, inArray } from 'drizzle-orm';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { ok } from '../../../core/response';

interface UserUpdatePayload {
  role?: Role;
  displayName?: string;
  tenantId?: string;
}

export const userRoutes = () => {
  const router = createRouter();

  // GET /users
  router.get('/users', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'user.manage');

    const rows =
      ctx.user.role === Role.SuperAdmin
        ? await db.select().from(users)
        : await db.select().from(users).where(inArray(users.tenantId, ctx.tenantIds));
    return c.json(ok({ data: rows }));
  });

  // PATCH /users/:id
  router.patch('/users/:id', async (c) => {
    const db = c.get('db');
    const ctx = await resolveContext(c.env, c.get('user'));
    assertPermission(ctx, 'role.manage');

    const id = c.req.param('id');
    const body = await c.req.json<{ role?: Role; displayName?: string; tenantId?: string }>();

    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) {
      return handleResult(c, errorResult(404, 'not found'));
    }
    if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(target.tenantId as string)) {
      return handleResult(c, errorResult(403, 'forbidden'));
    }

    const updates: UserUpdatePayload = {};
    if (body.role) updates.role = body.role;
    if (body.displayName) updates.displayName = body.displayName;
    if (body.tenantId) {
      if (ctx.user.role !== Role.SuperAdmin && !ctx.tenantIds.includes(body.tenantId as string)) {
        return handleResult(c, errorResult(403, 'forbidden'));
      }
      updates.tenantId = body.tenantId;
    }
    if (!Object.keys(updates).length) {
      return handleResult(c, errorResult(400, 'payload required'));
    }

    await db.update(users).set(updates).where(eq(users.id, id)).run();
    return c.json(ok({ ok: true }));
  });

  return router;
};
