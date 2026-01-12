import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const categoryRouteRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/category-routes', ({ store, user, query }) => handlers.listCategoryRoutes(env, store, user, query))
    .post('/category-routes', async ({ store, user, request }) => {
      const body = await request.json() as { productId: string; category: string; subcategory?: string; teamId: string };
      return handlers.createCategoryRoute(env, store, user, body);
    })
    .patch('/category-routes/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as { category?: string; subcategory?: string | null; teamId?: string };
      return handlers.updateCategoryRoute(env, store, user, params.id, body);
    })
    .delete('/category-routes/:id', ({ store, user, params }) => handlers.deleteCategoryRoute(env, store, user, params.id));
