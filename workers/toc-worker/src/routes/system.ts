import { Elysia } from 'elysia';
import { verifyJwt } from '../core/jwt';
import type { Bindings, WorkerSingleton } from '../core/types';

export const createSystemRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/health', () => ({ ok: true, ts: Date.now() }))
    .get('/whoami', async ({ request }) => {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!token) return new Response('missing token', { status: 401 });
      const identity = await verifyJwt(token, env);
      return { identity };
    });
