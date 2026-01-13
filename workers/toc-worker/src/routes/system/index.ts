import { createRouter } from '../../core/router';
import { verifyJwt } from '../../core/jwt';

export const systemRoutes = () => {
  const router = createRouter();

  router.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

  router.get('/whoami', async (c) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    if (!token) {
      return c.json({ error: 'missing token' }, 401);
    }
    const identity = await verifyJwt(token, c.env);
    return c.json({ identity });
  });

  return router;
};
