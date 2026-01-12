import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const productRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/products', ({ store, user }) => handlers.listProducts(env, store, user))
    .post('/products', async ({ store, user, request }) => {
      const body = await request.json() as any;
      return handlers.createProduct(env, store, user, body);
    })
    .patch('/products/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as any;
      return handlers.updateProduct(env, store, user, params.id, body);
    })
    .delete('/products/:id', ({ store, user, params }) => handlers.deleteProduct(env, store, user, params.id));
