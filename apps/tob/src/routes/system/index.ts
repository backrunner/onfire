import { rolePermissions } from '@onfire/shared';
import { createRouter } from '../../core/router';
import { resolveContext } from '../../core/context';
import { ok } from '../../core/response';

export const systemRoutes = () => {
  const router = createRouter();

  // GET /health
  router.get('/health', (c) => {
    return c.json(ok({ ok: true, scope: 'tob', ts: Date.now() }));
  });

  // GET /me
  router.get('/me', async (c) => {
    const ctx = await resolveContext(c.env, c.get('user'));
    return c.json(ok({
      user: ctx.user,
      role: ctx.user.role,
      permissions: rolePermissions[ctx.user.role] ?? [],
      tenantIds: ctx.tenantIds,
      productIds: ctx.productIds,
      teamIds: ctx.teamIds
    }));
  });

  return router;
};
