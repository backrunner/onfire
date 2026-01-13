import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const categoryRouteRoutes = (env: Bindings) =>
  createRouter()
    .get('/category-routes', ({ store, user, query }) => handlers.listCategoryRoutes(env, store, user, query))
    .post('/category-routes', ({ store, user, body }) =>
      handlers.createCategoryRoute(env, store, user, body), {
      body: t.Object({
        productId: t.String(),
        category: t.String(),
        subcategory: t.Optional(t.String()),
        teamId: t.String()
      })
    })
    .patch('/category-routes/:id', ({ store, user, params, body }) =>
      handlers.updateCategoryRoute(env, store, user, params.id, body), {
      body: t.Object({
        category: t.Optional(t.String()),
        subcategory: t.Optional(t.Union([t.String(), t.Null()])),
        teamId: t.Optional(t.String())
      })
    })
    .delete('/category-routes/:id', ({ store, user, params }) => handlers.deleteCategoryRoute(env, store, user, params.id))
;
