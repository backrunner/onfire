import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const productKeyRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/product-keys', ({ store, user, query }) => handlers.listProductKeys(env, store, user, query))
    .post('/product-keys', async ({ store, user, request }) => {
      const body = await request.json() as { productId: string; name?: string };
      return handlers.createProductKey(env, store, user, body);
    })
    .post('/product-keys/:id/rotate', ({ store, user, params }) => handlers.rotateProductKey(env, store, user, params.id))
    .patch('/product-keys/:id/revoke', async ({ store, user, params, request }) => {
      const body = await request.json().catch(() => ({})) as { revoked?: boolean };
      return handlers.revokeProductKey(env, store, user, params.id, body);
    });
